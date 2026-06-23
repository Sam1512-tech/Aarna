"use server";

import { eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { createRazorpayOrder } from "@/lib/razorpay";
import { checkServiceability } from "@/lib/delhivery";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCart, applyCoupon } from "@/lib/actions/cart";
import type { AddressInput, CheckoutSummary } from "@/lib/types";

const { customers, orders, orderItems, productVariants, coupons } = schema;

const FREE_SHIPPING_THRESHOLD = 299900; // ₹2999 in paise
const FLAT_SHIPPING_FEE = 9900; // ₹99 in paise

export interface CheckoutInitInput {
  email: string;
  shippingAddress: AddressInput;
  billingSameAsShipping: boolean;
  billingAddress?: AddressInput;
  couponCode?: string;
  whatsappOptIn: boolean;
}

export interface RazorpayOrderHandle {
  razorpayOrderId: string;
  razorpayKeyId: string;
  amount: number;
  currency: "INR";
  orderNumber: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function nextOrderNumber(): Promise<string> {
  await db.execute(sql`CREATE SEQUENCE IF NOT EXISTS order_seq START 1001`);
  const result = await db.execute(sql`SELECT nextval('order_seq')::int AS seq`);
  const rows = result as unknown as { seq: number }[];
  return `AARNA-${String(rows[0].seq).padStart(6, "0")}`;
}

function calculateShipping(taxableAfterDiscount: number): number {
  return taxableAfterDiscount >= FREE_SHIPPING_THRESHOLD ? 0 : FLAT_SHIPPING_FEE;
}

async function resolveCustomerId(email: string): Promise<string | null> {
  // If logged in, get customer id via supabase auth user
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (data.user?.email) {
    const c = await db
      .select({ id: customers.id })
      .from(customers)
      .where(eq(customers.email, data.user.email))
      .limit(1);
    if (c[0]) return c[0].id;
  }
  // Guest checkout — see if a customer record already exists for this email
  const existing = await db
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.email, email))
    .limit(1);
  return existing[0]?.id ?? null;
}

// ── Public actions ───────────────────────────────────────────────────────────

export async function initCheckout(
  input: CheckoutInitInput,
): Promise<{ summary: CheckoutSummary; razorpay: RazorpayOrderHandle }> {
  // 1. Get and validate cart
  const cart = await getCart();
  if (cart.lines.length === 0) throw new Error("Cart is empty");

  // 2. Verify stock for every line in one query (re-check at checkout time)
  const variantIds = cart.lines.map((l) => l.variantId);
  const variantRows = await db
    .select({
      id: productVariants.id,
      sku: productVariants.sku,
      stock: productVariants.stock,
      isActive: productVariants.isActive,
    })
    .from(productVariants)
    .where(inArray(productVariants.id, variantIds));

  const variantsById = new Map(variantRows.map((v) => [v.id, v]));
  for (const line of cart.lines) {
    const v = variantsById.get(line.variantId);
    if (!v) throw new Error(`Variant ${line.variantId} not found`);
    if (!v.isActive) throw new Error(`"${line.productTitle}" is no longer available`);
    if (v.stock < line.quantity) throw new Error(`"${line.productTitle}" is out of stock`);
  }

  // 3. Apply coupon (re-validate server-side; don't trust client)
  let discount = 0;
  let couponCode: string | null = null;
  if (input.couponCode) {
    const result = await applyCoupon(input.couponCode);
    if (!result.ok) throw new Error(result.message);
    discount = result.discount;
    couponCode = input.couponCode.trim().toUpperCase();
  }

  // 4. Calculate totals (all in paise)
  const subtotal = cart.subtotal;
  const shippingFee = calculateShipping(subtotal - discount);
  const total = subtotal - discount + shippingFee;

  if (total <= 0) throw new Error("Invalid order total");

  // 5. Resolve customer
  const customerId = await resolveCustomerId(input.email);

  // 6. Generate order number, insert internal order
  const orderNumber = await nextOrderNumber();

  const [createdOrder] = await db
    .insert(orders)
    .values({
      orderNumber,
      customerId,
      email: input.email,
      phone: input.shippingAddress.phone,
      shippingAddress: input.shippingAddress,
      billingAddress: input.billingSameAsShipping
        ? input.shippingAddress
        : (input.billingAddress ?? input.shippingAddress),
      subtotal,
      discount,
      shippingFee,
      total,
      couponCode,
    })
    .returning({ id: orders.id });

  // 7. Snapshot cart items into order_items (SKU pulled from variantsById)
  await db.insert(orderItems).values(
    cart.lines.map((line) => ({
      orderId: createdOrder.id,
      variantId: line.variantId,
      productTitleSnapshot: line.productTitle,
      variantLabelSnapshot: line.variantLabel,
      skuSnapshot: variantsById.get(line.variantId)?.sku ?? "",
      unitPriceSnapshot: line.unitPrice,
      quantity: line.quantity,
      lineTotal: line.unitPrice * line.quantity,
    })),
  );

  // 8. Create Razorpay order
  const rpOrder = await createRazorpayOrder({
    amountInPaise: total,
    receipt: orderNumber,
    notes: {
      internal_order_id: createdOrder.id,
      order_number: orderNumber,
      email: input.email,
    },
  });

  // 9. Save razorpay_order_id on internal order
  await db
    .update(orders)
    .set({ razorpayOrderId: rpOrder.id })
    .where(eq(orders.id, createdOrder.id));

  // 10. Bump coupon usage count if applied
  if (couponCode) {
    await db
      .update(coupons)
      .set({ usedCount: sql`${coupons.usedCount} + 1` })
      .where(eq(coupons.code, couponCode));
  }

  const summary: CheckoutSummary = {
    subtotal,
    discount,
    shippingFee,
    total,
    couponCode: couponCode ?? undefined,
  };

  const razorpay: RazorpayOrderHandle = {
    razorpayOrderId: rpOrder.id,
    razorpayKeyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? "",
    amount: total,
    currency: "INR",
    orderNumber,
  };

  return { summary, razorpay };
}

export async function checkPincodeServiceability(
  pincode: string,
): Promise<{ serviceable: boolean; etaDays?: number }> {
  // Basic Indian pincode validation — 6 digits
  if (!/^\d{6}$/.test(pincode)) {
    return { serviceable: false };
  }

  // Pre-KYC: if the Delhivery token isn't set yet, stay optimistic so Vismaya's
  // checkout UI keeps working. Once DELHIVERY_API_TOKEN is configured this hits
  // the real pincode serviceability API.
  if (!process.env.DELHIVERY_API_TOKEN) {
    return { serviceable: true, etaDays: 5 };
  }

  try {
    const result = await checkServiceability(pincode);
    // Aarna is prepaid-only, so prepaid serviceability is what matters.
    // (Delhivery's pincode endpoint doesn't return an ETA; 5 days is a placeholder.)
    return {
      serviceable: result.serviceable,
      etaDays: result.serviceable ? 5 : undefined,
    };
  } catch (err) {
    console.error("[checkout] Delhivery serviceability failed:", err);
    // Don't block checkout on a logistics-API hiccup.
    return { serviceable: true, etaDays: 5 };
  }
}
