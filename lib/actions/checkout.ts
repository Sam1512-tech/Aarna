"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { createRazorpayOrder } from "@/lib/razorpay";
import { checkServiceability } from "@/lib/delhivery";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCart, applyCoupon } from "@/lib/actions/cart";
import {
  buildInvoiceData,
  ensureInvoiceSequence,
  getOrderById,
  releaseExpiredCheckoutHolds,
} from "@/lib/db/queries/orders";
import {
  currentFinancialYear,
  generateInvoicePdf,
  invoiceSequenceName,
} from "@/lib/invoice/generate";
import { sendEmail } from "@/lib/resend";
import { notifyWhatsApp, firstNameFromAddress, rupees } from "@/lib/whatsapp/notify";
import { alertAdminSuspiciousActivity } from "@/lib/security/alert-admin";
import type { AddressInput, CheckoutSummary } from "@/lib/types";
import { ActionError } from "@/lib/action-error";
import { isValidGstin, normalizeGstin } from "@/lib/gst";
import { shippingAddressSchema } from "@/lib/checkout/address-schema";
import { COD_CONVENIENCE_FEE_PAISE } from "@/lib/checkout/cod";
import { fetchIndiaPostal } from "@/lib/checkout/india-postal";

const { customers, orders, orderItems, productVariants, inventoryMovements, carts, cartItems } = schema;

export interface CheckoutInitInput {
  email: string;
  shippingAddress: AddressInput;
  billingSameAsShipping: boolean;
  billingAddress?: AddressInput;
  couponCode?: string;
  whatsappOptIn: boolean;
  /** Buyer's GSTIN, optional — only set for a business/GST invoice. */
  gstNumber?: string;
  paymentMethod: "prepaid" | "cod";
}

export interface RazorpayOrderHandle {
  razorpayOrderId: string;
  razorpayKeyId: string;
  amount: number;
  currency: "INR";
  orderNumber: string;
}

export type CheckoutInitResult =
  | { paymentMethod: "prepaid"; razorpay: RazorpayOrderHandle; orderNumber: string; summary: CheckoutSummary }
  | { paymentMethod: "cod"; orderNumber: string; summary: CheckoutSummary };

// ── Helpers ──────────────────────────────────────────────────────────────────

async function nextOrderNumber(): Promise<string> {
  await db.execute(sql`CREATE SEQUENCE IF NOT EXISTS order_seq START 1001`);
  const result = await db.execute(sql`SELECT nextval('order_seq')::int AS seq`);
  const rows = result as unknown as { seq: number }[];
  return `AARNA-${String(rows[0].seq).padStart(6, "0")}`;
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
): Promise<CheckoutInitResult> {
  // 0. Release any expired checkout holds first, so their stock is available
  // again before this checkout's own stock check/reservation below (see
  // releaseExpiredCheckoutHolds — this is what stands in for a frequent
  // cron, which Vercel's Hobby plan doesn't allow).
  await releaseExpiredCheckoutHolds();

  // 1. Get and validate cart
  const cart = await getCart();
  if (cart.lines.length === 0) throw new ActionError("Cart is empty");

  // 1b. Shipping address — the storefront form validates this heavily, but
  // never trust client-side validation alone for something that ends up on
  // a legal tax document. A missing/malformed `state` in particular used to
  // reach isInterStateOrder/calculateOrderGst unchecked and crash invoice
  // generation later (on the payment.captured webhook and on admin
  // reprint/batch-print) — catching it here means a bad request fails
  // checkout with a clear message instead of failing invoicing after the
  // customer has already paid.
  const addressResult = shippingAddressSchema.safeParse(input.shippingAddress);
  if (!addressResult.success) {
    throw new ActionError(
      addressResult.error.issues[0]?.message ?? "Please check your shipping address",
    );
  }

  // 1b-ii. Cross-check the submitted state against what India Post's own
  // pincode database says — never trust it just because the client's own
  // pincode-entry effect (checkout-view.tsx) already tried to auto-fill it.
  // That auto-fill only runs on fresh pincode entry; a saved address (or a
  // stale client bundle, or a request that bypasses the form entirely)
  // reaches here with whatever state happened to be stored, unverified.
  // Found the hard way on two real orders (AARNA-001108, AARNA-001138, same
  // customer, both shipping to a genuine Navsari/Gujarat pincode but with
  // "Karnataka" as the stored state) — both got the wrong invoice tax type
  // (CGST+SGST instead of IGST) because isInterStateOrder trusted that
  // unverified value. Same "always overwrite, state is 1:1 with pincode"
  // rule the client already applies, just enforced server-side so no path
  // can skip it. Fails open on a lookup hiccup ("unknown") — same reasoning
  // as checkPincodeServiceability's own failures below: a flaky third-party
  // API must never block a real checkout. "not_found" (the API positively
  // confirms the pincode doesn't exist) does still block, same as the
  // client's own hard-block for that case.
  let shippingAddress = input.shippingAddress;
  const postal = await fetchIndiaPostal(shippingAddress.pincode);
  if (postal.status === "not_found") {
    throw new ActionError("That pincode doesn't appear to be valid — please check your address");
  }
  if (postal.status === "found") {
    shippingAddress = { ...shippingAddress, state: postal.record.state };
  }

  // 1c. Cash on Delivery pincode gate — never trust the client's own read of
  // codServiceable (checkPincodeServiceability's own client consumer only
  // uses it to decide what to *show*). Re-checked here, independently,
  // before a COD order is ever allowed to be created.
  if (input.paymentMethod === "cod") {
    const pincodeCheck = await checkPincodeServiceability(input.shippingAddress.pincode);
    if (!pincodeCheck.codServiceable) {
      throw new ActionError(
        "Cash on Delivery isn't available for this pincode — please choose online payment",
      );
    }
  }

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

  // 3. Calculate totals (all in paise). Shipping is free site-wide (client
  // decision) — shippingFee is always 0 for new orders. The column itself
  // stays on the order row (still read by historical invoices/reports for
  // orders placed before this change, which had a real ₹0–₹99 charge) —
  // this only changes what gets written into NEW rows going forward.
  const subtotal = cart.subtotal;
  const shippingFee = 0;
  // Non-taxable, same treatment as shippingFee — see lib/checkout/cod.ts.
  const codFee = input.paymentMethod === "cod" ? COD_CONVENIENCE_FEE_PAISE : 0;
  const total = subtotal - discount + shippingFee + codFee;

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

  // 5b. COD only: bootstrap this financial year's invoice sequence before
  // opening the transaction below (mirrors markOrderPaid's own discipline —
  // see its comment for why the sequence draw itself must happen INSIDE the
  // insert, not here). Prepaid orders skip this entirely; their invoice
  // number is generated later, inside markOrderPaid, once payment.captured
  // actually lands — there's no webhook to defer to for COD, so the invoice
  // has to exist the moment the order is placed (GST liability arises at
  // time of supply, not payment).
  const financialYear = input.paymentMethod === "cod" ? currentFinancialYear() : null;
  const invoiceSeqName = financialYear ? invoiceSequenceName(financialYear) : null;
  const invoicePrefix = financialYear ? `AL/${financialYear}/` : null;
  if (invoiceSeqName && invoicePrefix) {
    await ensureInvoiceSequence(invoiceSeqName, invoicePrefix);
  }

  // 6. Reserve stock and create the order atomically in one transaction.
  // Each variant is checked AND decremented under a row lock (SELECT ... FOR
  // UPDATE) in the same step — closing the race where two concurrent
  // checkouts for the last unit of a variant could both pass a plain
  // read-only check (the old behavior) and both go on to pay for the same
  // physical item. If this order never completes payment, the reservation
  // is released by markOrderPaymentFailed (declined payment) or
  // releaseExpiredCheckoutHolds (abandoned checkout, no webhook at all).
  const orderId = await db.transaction(async (tx) => {
    // COD-only: close the double-submit race a prepaid checkout doesn't
    // have. A duplicate prepaid submit only ever produces a second harmless
    // "pending" order — it still needs a distinct Razorpay payment
    // confirmation to become real, and an abandoned one self-heals via
    // releaseExpiredCheckoutHolds. A duplicate COD submit needs no further
    // customer action at all: it's fully self-completing right here (real
    // invoice, real stock decrement, real confirmation), and cod_pending
    // orders are never touched by that same cleanup — so two near-
    // simultaneous submits (a slow connection double-tap, a client retry)
    // could otherwise both create a real, separately-shippable order for
    // the same cart, with the courier collecting cash twice.
    //
    // pg_advisory_xact_lock serializes concurrent transactions for the same
    // customer; by itself that only makes them sequential, it doesn't stop
    // the second one from still creating a duplicate order — the fresh
    // re-read of the cart right after acquiring the lock is what actually
    // closes the race, since the first call's own in-transaction cart-clear
    // (below) has by then already committed and removed these exact items.
    if (input.paymentMethod === "cod") {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${customerId}))`);

      const [freshCart] = await tx
        .select({ id: carts.id })
        .from(carts)
        .where(eq(carts.customerId, customerId))
        .limit(1);
      const freshCount = freshCart
        ? await tx
            .select({ id: cartItems.id })
            .from(cartItems)
            .where(eq(cartItems.cartId, freshCart.id))
            .limit(1)
        : [];
      if (freshCount.length === 0) {
        throw new ActionError("Cart is empty");
      }
    }

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
        // Distinguish "gone entirely" from "not enough for the quantity you
        // asked for" — both used to say the same "is out of stock", which is
        // simply false in the second case (this is also the exact moment a
        // last-unit race with another customer's checkout hold surfaces, so
        // naming what's actually true here matters, not just the product).
        throw new ActionError(
          variant.stock <= 0
            ? `"${line.productTitle}" just sold out — remove it from your bag to continue`
            : `Only ${variant.stock} of "${line.productTitle}" left — please reduce the quantity in your bag`,
        );
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
        phone: shippingAddress.phone,
        whatsappOptIn: input.whatsappOptIn,
        shippingAddress,
        billingAddress: input.billingSameAsShipping
          ? shippingAddress
          : (input.billingAddress ?? shippingAddress),
        subtotal,
        discount,
        shippingFee,
        codFee,
        total,
        couponCode,
        gstNumber,
        paymentMethod: input.paymentMethod,
        stockReserved: true,
        // COD only: generated synchronously here (see 5b above) since there's
        // no payment.captured webhook to defer to for COD — the invoice
        // number draw itself happens inside this insert's own SET-equivalent
        // (Postgres only evaluates it for the row actually being written),
        // mirroring markOrderPaid's "sequence draw is the last thing that can
        // fail" discipline. Prepaid orders leave these at their column
        // defaults (pending/pending/null/null), unchanged from before.
        ...(input.paymentMethod === "cod" && invoiceSeqName && invoicePrefix
          ? {
              paymentStatus: "cod_pending" as const,
              fulfillmentStatus: "processing" as const,
              placedAt: new Date(),
              invoiceNumber: sql`${invoicePrefix} || lpad(nextval('${sql.raw(invoiceSeqName)}')::text, 5, '0')`,
            }
          : {}),
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

    // COD only, and deliberately INSIDE this same transaction (not the
    // post-transaction clearPurchasedCartItems call prepaid relies on) —
    // this is the write that actually closes the double-submit race: a
    // concurrent call blocked on the advisory lock above only sees this
    // cart as empty, once unblocked, because this delete has already
    // committed by the time its lock is granted.
    if (input.paymentMethod === "cod") {
      const variantIds = cart.lines.map((line) => line.variantId);
      const [cartRow] = await tx
        .select({ id: carts.id })
        .from(carts)
        .where(eq(carts.customerId, customerId))
        .limit(1);
      if (cartRow) {
        await tx
          .delete(cartItems)
          .where(
            and(eq(cartItems.cartId, cartRow.id), inArray(cartItems.variantId, variantIds)),
          );
      }
    }

    return createdOrder.id;
  });

  // Coupon usedCount is intentionally NOT bumped here for either payment
  // method. For prepaid it's incremented in the payment.captured webhook;
  // for COD it's incremented when applyDelhiveryStatus auto-confirms
  // delivery (lib/db/queries/orders.ts, incrementCouponUsage) — in both
  // cases, only once the order has actually converted into real revenue,
  // not at order-creation time, so an abandoned/never-collected order can't
  // exhaust a coupon's budget without a single real redemption ever landing.

  const summary: CheckoutSummary = {
    subtotal,
    discount,
    shippingFee,
    codFee,
    total,
    couponCode: couponCode ?? undefined,
  };

  if (input.paymentMethod === "cod") {
    // No Razorpay order for COD — the order is already fully placed
    // (cod_pending, invoiced, stock reserved) as of the transaction above.
    // Everything below mirrors the payment.captured webhook's own
    // invoice/email/WhatsApp side effects, since nothing else will ever fire
    // them for a COD order (there's no webhook to defer to).
    const order = await getOrderById(orderId);
    if (!order || !order.invoiceNumber) {
      // Should be unreachable — the transaction above always sets both for
      // a COD order — but if it somehow happens, fail loudly rather than
      // silently skipping the customer's confirmation.
      throw new ActionError("Something went wrong placing your order — please contact support");
    }

    // Cart already cleared inside the stock-reservation transaction above
    // (deliberately, not via the post-transaction clearPurchasedCartItems
    // prepaid relies on — see that transaction's own comment for why).

    // Never let a PDF/email hiccup break checkout itself — the order is
    // already real and paid-for-later at this point, same "alert an admin,
    // keep going" rule the payment.captured webhook follows for prepaid.
    try {
      const invoiceData = buildInvoiceData(order, order.invoiceNumber);
      const pdfBuffer = await generateInvoicePdf(invoiceData);
      const pdfFilename = `${order.invoiceNumber.replace(/\//g, "-")}.pdf`;

      await sendEmail({
        to: order.email,
        subject: `Order Confirmed — ${order.orderNumber} | Aarna`,
        templateKey: "order_receipt",
        data: { order, invoiceNumber: order.invoiceNumber },
        attachments: [{ filename: pdfFilename, content: pdfBuffer }],
      });
    } catch (err) {
      console.error("[checkout] COD invoice generation/email failed:", err);
      await alertAdminSuspiciousActivity({
        event: "COD order confirmation email failed to send",
        detail: `Order ${order.orderNumber} (${order.invoiceNumber}) was placed as Cash on Delivery, but the invoice PDF/confirmation email failed: ${err instanceof Error ? err.message : String(err)}. Use "Resend confirmation email" on /studio/orders/${order.orderNumber} once the underlying issue is fixed.`,
      }).catch((alertErr) => {
        console.error("[checkout] COD failure alert itself failed:", alertErr);
      });
    }

    await notifyWhatsApp({
      orderId: order.id,
      phone: order.phone,
      whatsappOptIn: order.whatsappOptIn,
      templateKey: "order_placed",
      bodyValues: [
        firstNameFromAddress(order.shippingAddress),
        order.orderNumber,
        rupees(order.total),
      ],
    });

    return { paymentMethod: "cod", orderNumber, summary };
  }

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

  const razorpay: RazorpayOrderHandle = {
    razorpayOrderId: rpOrder.id,
    razorpayKeyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? "",
    amount: total,
    currency: "INR",
    orderNumber,
  };

  return { paymentMethod: "prepaid", razorpay, orderNumber, summary };
}

// Bengaluru (560xxx) ships noticeably faster than the rest of India — the
// warehouse ("Aarna Godown") is in Bengaluru, so it's effectively same-city
// for those pincodes. Calibrated Aug 2026 from real Delhivery tracking data
// (order-placed to the courier's actual "Delivered" scan timestamp, not our
// own DB's delivered_at column — which was unreliable for older orders due
// to the webhook outage documented in CLAUDE.md) across 19 genuinely-
// delivered Bengaluru orders: median 2.13 days, average 2.19 days, with the
// large majority between 1.2–2.9 days. "2-3 days" reflects that typical
// case. The rest-of-India figure is still the original placeholder (5
// days) — no comparably real, verified data for other regions yet; revisit
// once order volume outside Bengaluru is large enough to calibrate the same
// way (and exclude any order whose real Delhivery status shows it was never
// actually picked up, which skews the average — see the return-investigation
// note in CLAUDE.md for why that check matters here).
function estimatedDeliveryWindow(pincode: string): string {
  return pincode.startsWith("560") ? "2-3" : "5";
}

export async function checkPincodeServiceability(
  pincode: string,
): Promise<{ serviceable: boolean; etaDays?: string; codServiceable: boolean }> {
  // Basic Indian pincode validation — 6 digits
  if (!/^\d{6}$/.test(pincode)) {
    return { serviceable: false, codServiceable: false };
  }

  // Pre-KYC: if the Delhivery token isn't set yet, stay optimistic so Vismaya's
  // checkout UI keeps working. Once DELHIVERY_API_TOKEN is configured this hits
  // the real pincode serviceability API. COD stays false here (fail closed —
  // without a real answer from Delhivery, offering COD would be a guess, and
  // silently letting a customer choose an unserviceable payment method is a
  // worse failure than just not offering it).
  if (!process.env.DELHIVERY_API_TOKEN) {
    return { serviceable: true, etaDays: estimatedDeliveryWindow(pincode), codServiceable: false };
  }

  try {
    const result = await checkServiceability(pincode);
    // Raw upstream result, not just the booleans we return — so a "why did
    // this pincode read as not-serviceable" question can be answered from
    // logs alone instead of guessing whether Delhivery said no or something
    // upstream of Delhivery's answer went wrong.
    console.log(`[checkout] Delhivery serviceability for ${pincode}:`, result);
    // prepaid serviceability drives the general "can we ship here" answer;
    // codServiceable is independent — a pincode can be prepaid-only.
    return {
      serviceable: result.serviceable,
      etaDays: result.serviceable ? estimatedDeliveryWindow(pincode) : undefined,
      codServiceable: result.codServiceable,
    };
  } catch (err) {
    console.error(`[checkout] Delhivery serviceability call failed for ${pincode}:`, err);
    // Don't block checkout on a logistics-API hiccup — but COD stays false,
    // same fail-closed reasoning as the pre-KYC branch above.
    return { serviceable: true, etaDays: estimatedDeliveryWindow(pincode), codServiceable: false };
  }
}
