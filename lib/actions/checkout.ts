"use server";

import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { createRazorpayOrder } from "@/lib/razorpay";
import { checkServiceability } from "@/lib/delhivery";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCart, applyCoupon } from "@/lib/actions/cart";
import { releaseExpiredCheckoutHolds } from "@/lib/db/queries/orders";
import type { AddressInput, CheckoutSummary } from "@/lib/types";
import { ActionError } from "@/lib/action-error";
import { isValidGstin, normalizeGstin } from "@/lib/gst";

const { customers, orders, orderItems, productVariants, inventoryMovements, coupons } = schema;

const FREE_SHIPPING_THRESHOLD = 299900; // ₹2999 in paise
const FLAT_SHIPPING_FEE = 9900; // ₹99 in paise

export interface CheckoutInitInput {
  email: string;
  shippingAddress: AddressInput;
  billingSameAsShipping: boolean;
  billingAddress?: AddressInput;
  couponCode?: string;
  whatsappOptIn: boolean;
  /** Buyer's GSTIN, optional — only set for a business/GST invoice. */
  gstNumber?: string;
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

/**
 * Checkout requires a signed-in customer (guest checkout removed by client
 * decision Jul 13). Every order is linked to an account so returns/exchanges
 * can always be raised from the dashboard.
 */
async function requireCheckoutCustomer(): Promise<{
  id: string;
  email: string;
}> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) {
    const c = await db
      .select({ id: customers.id, email: customers.email })
      .from(customers)
      .where(eq(customers.id, data.user.id))
      .limit(1);
    if (c[0]) return c[0];
  }
  throw new ActionError("Please sign in to place your order");
}

// ── Public actions ───────────────────────────────────────────────────────────

export async function initCheckout(
  input: CheckoutInitInput,
): Promise<{ summary: CheckoutSummary; razorpay: RazorpayOrderHandle }> {
  // 0. Release any expired checkout holds first, so their stock is available
  // again before this checkout's own stock check/reservation below (see
  // releaseExpiredCheckoutHolds — this is what stands in for a frequent
  // cron, which Vercel's Hobby plan doesn't allow).
  await releaseExpiredCheckoutHolds();

  // 1. Get and validate cart
  const cart = await getCart();
  if (cart.lines.length === 0) throw new ActionError("Cart is empty");

  // 2. Apply coupon (re-validate server-side; don't trust client)
  let discount = 0;
  let couponCode: string | null = null;
  if (input.couponCode) {
    const result = await applyCoupon(input.couponCode);
    if (!result.ok) throw new ActionError(result.message);
    discount = result.discount;
    couponCode = input.couponCode.trim().toUpperCase();
  }

  // 2b. GST number — optional, but if provided it must be a real GSTIN.
  // Never trust client-side validation alone for something that ends up on a
  // legal tax document.
  const gstNumber = normalizeGstin(input.gstNumber);
  if (gstNumber && !isValidGstin(gstNumber)) {
    throw new ActionError("That GST number doesn't look valid — check and try again");
  }

  // 3. Calculate totals (all in paise)
  const subtotal = cart.subtotal;
  const shippingFee = calculateShipping(subtotal - discount);
  const total = subtotal - discount + shippingFee;

  if (total <= 0) throw new ActionError("Invalid order total");

  // 4. Resolve customer — must be signed in; the order is always tied to the
  // account email so it shows up in the dashboard (returns/exchanges).
  const customer = await requireCheckoutCustomer();
  const customerId = customer.id;
  const orderEmail = customer.email || input.email;

  // 5. Generate order number. Postgres sequences are never transactional —
  // a nextval() is never rolled back even if the reservation below fails —
  // so this can safely happen outside the transaction (same as before;
  // a failed checkout already "wastes" a number today).
  const orderNumber = await nextOrderNumber();

  // 6. Reserve stock and create the order atomically in one transaction.
  // Each variant is checked AND decremented under a row lock (SELECT ... FOR
  // UPDATE) in the same step — closing the race where two concurrent
  // checkouts for the last unit of a variant could both pass a plain
  // read-only check (the old behavior) and both go on to pay for the same
  // physical item. If this order never completes payment, the reservation
  // is released by markOrderPaymentFailed (declined payment) or
  // releaseExpiredCheckoutHolds (abandoned checkout, no webhook at all).
  const orderId = await db.transaction(async (tx) => {
    const skuByVariantId = new Map<string, string>();

    for (const line of cart.lines) {
      const [variant] = await tx
        .select({
          sku: productVariants.sku,
          stock: productVariants.stock,
          isActive: productVariants.isActive,
        })
        .from(productVariants)
        .where(eq(productVariants.id, line.variantId))
        .for("update");

      if (!variant) throw new ActionError(`Variant ${line.variantId} not found`);
      if (!variant.isActive) {
        throw new ActionError(`"${line.productTitle}" is no longer available`);
      }
      if (variant.stock < line.quantity) {
        throw new ActionError(`"${line.productTitle}" is out of stock`);
      }

      await tx
        .update(productVariants)
        .set({ stock: variant.stock - line.quantity })
        .where(eq(productVariants.id, line.variantId));

      await tx.insert(inventoryMovements).values({
        variantId: line.variantId,
        delta: -line.quantity,
        reason: "sale",
        referenceId: orderNumber,
      });

      skuByVariantId.set(line.variantId, variant.sku);
    }

    const [createdOrder] = await tx
      .insert(orders)
      .values({
        orderNumber,
        customerId,
        email: orderEmail,
        phone: input.shippingAddress.phone,
        whatsappOptIn: input.whatsappOptIn,
        shippingAddress: input.shippingAddress,
        billingAddress: input.billingSameAsShipping
          ? input.shippingAddress
          : (input.billingAddress ?? input.shippingAddress),
        subtotal,
        discount,
        shippingFee,
        total,
        couponCode,
        gstNumber,
        stockReserved: true,
      })
      .returning({ id: orders.id });

    // Snapshot cart items into order_items (SKU pulled from skuByVariantId)
    await tx.insert(orderItems).values(
      cart.lines.map((line) => ({
        orderId: createdOrder.id,
        variantId: line.variantId,
        productTitleSnapshot: line.productTitle,
        variantLabelSnapshot: line.variantLabel,
        skuSnapshot: skuByVariantId.get(line.variantId) ?? "",
        unitPriceSnapshot: line.unitPrice,
        quantity: line.quantity,
        lineTotal: line.unitPrice * line.quantity,
      })),
    );

    return createdOrder.id;
  });

  // 7. Create Razorpay order
  const rpOrder = await createRazorpayOrder({
    amountInPaise: total,
    receipt: orderNumber,
    notes: {
      internal_order_id: orderId,
      order_number: orderNumber,
      email: orderEmail,
    },
  });

  // 8. Save razorpay_order_id on internal order
  await db
    .update(orders)
    .set({ razorpayOrderId: rpOrder.id })
    .where(eq(orders.id, orderId));

  // 9. Bump coupon usage count if applied
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
