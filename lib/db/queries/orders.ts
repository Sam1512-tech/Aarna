import { and, eq, inArray, lt, ne, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { InvoiceData } from "@/lib/invoice/generate";
import {
  calculateOrderGst,
  currentFinancialYear,
  isInterStateOrder,
} from "@/lib/invoice/generate";
import { applyStockMovement } from "@/lib/db/queries/inventory";
import { fetchRazorpayOrderStatus } from "@/lib/razorpay";
import { alertAdminSuspiciousActivity } from "@/lib/security/alert-admin";

const { orders, orderItems, returns, carts, cartItems, messageLog, coupons } = schema;

/** How long a checkout attempt holds its reserved stock before it's treated
 * as abandoned and released back — see releaseExpiredCheckoutHolds. */
export const CHECKOUT_HOLD_MINUTES = 20;

export type OrderRow = typeof orders.$inferSelect;
export type OrderItemRow = typeof orderItems.$inferSelect;
export type OrderWithItems = OrderRow & { orderItems: OrderItemRow[] };

export async function getOrderByRazorpayId(
  razorpayOrderId: string,
): Promise<OrderWithItems | null> {
  const order = await db
    .select()
    .from(orders)
    .where(eq(orders.razorpayOrderId, razorpayOrderId))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!order) return null;

  const items = await db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, order.id));

  return { ...order, orderItems: items };
}

export type MarkOrderPaidResult =
  | { won: true; invoiceNumber: string }
  | { won: false; invoiceNumber: null };

/**
 * Marks an order paid. Guarded to only fire from `pending` or `failed` — NOT
 * a blanket `paymentStatus <> 'paid'` — so that two concurrent
 * `payment.captured` deliveries for the same order (Razorpay documents
 * at-least-once webhook delivery) can't both win: only the first write
 * lands, the second updates zero rows. `failed` is deliberately included
 * (not just `pending`): a capture can legitimately arrive after
 * `releaseExpiredCheckoutHolds` or an earlier `payment.failed` already
 * flipped the order to `failed`. `refunded`/`partially_refunded` are
 * deliberately EXCLUDED — those only exist after a real prior payment (see
 * `recordRefund`), so a replayed/redelivered `payment.captured` for one of
 * them must never resurrect it back to `paid`, overwrite its invoice number,
 * or reset `placedAt` (which the GST sales register keys off of).
 *
 * The invoice number is generated INSIDE this same guarded UPDATE (Postgres
 * only evaluates a `SET` expression for rows the `WHERE` clause actually
 * matches) rather than pulled beforehand — pulling it first would still let
 * a losing delivery burn a real, permanent value off the shared sequence
 * for a write that never lands, leaving an unexplained gap in the
 * financial-year invoice sequence.
 *
 * Returns whether this call was the one that actually transitioned the
 * order — the caller uses that to decide whether to run the paid-order side
 * effects (invoice, stock, coupon count, notifications) at all.
 */
export async function markOrderPaid(
  orderId: string,
  razorpayPaymentId: string,
): Promise<MarkOrderPaidResult> {
  await db.execute(sql`CREATE SEQUENCE IF NOT EXISTS invoice_seq START 1`);
  const invoicePrefix = `AL/${currentFinancialYear()}/`;

  const updated = await db
    .update(orders)
    .set({
      invoiceNumber: sql`${invoicePrefix} || lpad(nextval('invoice_seq')::text, 5, '0')`,
      razorpayPaymentId,
      paymentStatus: "paid",
      fulfillmentStatus: "processing",
      placedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(orders.id, orderId), inArray(orders.paymentStatus, ["pending", "failed"])))
    .returning({ id: orders.id, invoiceNumber: orders.invoiceNumber });

  if (updated.length === 0 || !updated[0].invoiceNumber) {
    return { won: false, invoiceNumber: null };
  }
  return { won: true, invoiceNumber: updated[0].invoiceNumber };
}

/**
 * Atomically bumps a coupon's redemption counter, refusing to cross its own
 * usage limit — `WHERE usedCount < usageLimit` makes the check-and-increment
 * a single statement, closing the race where two simultaneous checkouts both
 * read a stale `usedCount` and both redeem a one-time coupon. Called from the
 * `payment.captured` webhook (once payment is actually confirmed, guarded by
 * the same `markOrderPaid` idempotency check) rather than at order-creation
 * time, so a coupon's budget is only spent by checkouts that actually paid —
 * an abandoned or repeatedly-retried checkout no longer exhausts it.
 *
 * Returns false if the limit was already reached by other concurrent paid
 * orders. That race is real and not narrow: because the counter is no
 * longer touched at order-creation time, `applyCoupon`'s own limit check
 * (lib/actions/cart.ts) stays "not yet reached" for every order created
 * before ANY of them finishes paying — a window that spans the whole
 * checkout-to-payment-capture latency, up to CHECKOUT_HOLD_MINUTES for an
 * order that sits pending the whole time. For a heavily-publicized
 * usageLimit=1 coupon, more than two customers could plausibly all pass
 * validation and all pay before the first one's webhook lands. This is a
 * deliberate tradeoff, not an oversight: by design this function never
 * blocks or reverses an already-captured payment, it only stops the counter
 * itself from over-counting — the discount was already honored on each such
 * order's own total and invoice at checkout time. A hard pre-payment
 * reservation (mirroring the stock row-lock in initCheckout) would close
 * this properly if a coupon's exact redemption count ever needs to be a
 * hard cap rather than a best-effort one.
 */
export async function incrementCouponUsage(couponCode: string): Promise<boolean> {
  const updated = await db
    .update(coupons)
    .set({ usedCount: sql`${coupons.usedCount} + 1` })
    .where(
      and(
        eq(coupons.code, couponCode),
        sql`(${coupons.usageLimit} IS NULL OR ${coupons.usedCount} < ${coupons.usageLimit})`,
      ),
    )
    .returning({ id: coupons.id });
  return updated.length > 0;
}

/**
 * Detects (after the fact — never blocks) whether a customer's paid orders
 * against one coupon now exceed its perCustomerLimit. applyCoupon's own
 * pre-payment check (lib/actions/cart.ts) only sees redemptions that have
 * ALREADY landed as paid, so it closes the sequential-reuse case (apply,
 * pay, try again later) but is genuinely TOCTOU-racy against two
 * concurrent checkouts for the same customer+coupon: both can see 0 prior
 * paid redemptions and both go on to pay, exactly mirroring the same class
 * of race incrementCouponUsage (above) closes for the coupon's GLOBAL
 * usageLimit — same fix shape applied to a per-customer count instead of a
 * simple counter column.
 *
 * A Postgres advisory lock keyed on (customerId, couponCode) serializes
 * concurrent calls for the same customer+coupon pair so the count below
 * can't itself race: the first payment.captured to reach this function for
 * a given customer+coupon sees count=1 (itself) and passes; if a second,
 * concurrently-paid order for the same customer+coupon reaches this
 * function next, the lock makes it wait for the first to finish, then it
 * counts BOTH now-paid orders and correctly detects the overage.
 *
 * Deliberately never blocks or reverses an already-captured payment — by
 * the time this runs the customer has already paid and the discount was
 * already honored on that order's own total/invoice at checkout time.
 * Returns whether the customer is now over their per-order limit, so the
 * caller can alert an admin the same way incrementCouponUsage's caller
 * does for the global limit.
 */
export async function checkCouponPerCustomerOverage(
  customerId: string,
  couponCode: string,
): Promise<{ overLimit: boolean; timesUsed: number; limit: number } | null> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${customerId + ":" + couponCode}))`,
    );

    const [coupon] = await tx
      .select({ perCustomerLimit: coupons.perCustomerLimit })
      .from(coupons)
      .where(eq(coupons.code, couponCode))
      .limit(1);
    if (!coupon) return null;

    const [{ count }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(orders)
      .where(
        and(
          eq(orders.customerId, customerId),
          eq(orders.couponCode, couponCode),
          inArray(orders.paymentStatus, ["paid", "partially_refunded", "refunded"]),
        ),
      );

    return {
      overLimit: count > coupon.perCustomerLimit,
      timesUsed: count,
      limit: coupon.perCustomerLimit,
    };
  });
}

/**
 * Remove the purchased variants from the customer's cart. Checkout snapshots
 * the cart into order_items but never empties it, so without this the bag
 * (and the header count badge) keeps showing the items after a successful
 * payment. Only the ordered variants are removed — anything the customer
 * added between initiating checkout and the webhook firing stays in the bag.
 */
export async function clearPurchasedCartItems(order: OrderWithItems) {
  if (!order.customerId) return;
  const variantIds = order.orderItems.map((item) => item.variantId);
  if (variantIds.length === 0) return;

  const cart = await db
    .select({ id: carts.id })
    .from(carts)
    .where(eq(carts.customerId, order.customerId))
    .limit(1)
    .then((rows) => rows[0] ?? null);
  if (!cart) return;

  await db
    .delete(cartItems)
    .where(
      and(
        eq(cartItems.cartId, cart.id),
        inArray(cartItems.variantId, variantIds),
      ),
    );
}

export async function getOrderByRazorpayPaymentId(
  razorpayPaymentId: string,
): Promise<OrderRow | null> {
  return db
    .select()
    .from(orders)
    .where(eq(orders.razorpayPaymentId, razorpayPaymentId))
    .limit(1)
    .then((rows) => rows[0] ?? null);
}

/**
 * Marks a still-pending order as failed and releases the stock initCheckout
 * reserved for it. No-op if the order was already paid (a late
 * payment.failed event must never override a successful capture) or already
 * failed (e.g. released earlier by releaseExpiredCheckoutHolds — the WHERE
 * clause only ever matches a row still "pending", so this can never
 * double-restore stock for the same order). Returns true if a row was
 * actually updated.
 *
 * Only restores stock when stock_reserved is true — an order created before
 * this column existed never actually had its stock decremented at checkout
 * (the old logic only checked stock, never reserved it), so "restoring" it
 * would incorrectly inflate that variant's real stock count.
 */
export async function markOrderPaymentFailed(
  razorpayOrderId: string,
): Promise<boolean> {
  const updated = await db
    .update(orders)
    .set({ paymentStatus: "failed", updatedAt: new Date() })
    .where(
      and(
        eq(orders.razorpayOrderId, razorpayOrderId),
        eq(orders.paymentStatus, "pending"),
      ),
    )
    .returning({
      id: orders.id,
      orderNumber: orders.orderNumber,
      stockReserved: orders.stockReserved,
    });

  if (updated.length === 0) return false;

  const { id, orderNumber, stockReserved } = updated[0];
  if (stockReserved) {
    const items = await db
      .select({ variantId: orderItems.variantId, quantity: orderItems.quantity })
      .from(orderItems)
      .where(eq(orderItems.orderId, id));
    await applyStockMovement(items, 1, "return", orderNumber);
  }

  return true;
}

/**
 * Releases stock held by checkout attempts that started but never completed
 * payment within CHECKOUT_HOLD_MINUTES — closes the gap between "stock is
 * reserved the instant checkout begins" (see initCheckout) and "the customer
 * actually pays." A genuine decline is released immediately by
 * markOrderPaymentFailed via the payment.failed webhook; this is the
 * backstop for checkouts that got no webhook at all (closed tab before ever
 * submitting payment). Called opportunistically at the start of every
 * checkout attempt, plus as a daily backstop in the cleanup-orders cron —
 * deliberately NOT a dedicated frequent cron, since Vercel's Hobby plan cron
 * jobs run at most once a day.
 *
 * The UPDATE ... WHERE payment_status = 'pending' ... RETURNING atomically
 * claims each row (Postgres row-level locking), so two concurrent callers
 * (a real checkout's opportunistic call racing the daily cron) can never
 * both "win" the same order and double-restore its stock.
 *
 * Only restores stock for rows with stock_reserved = true. An order created
 * before that column existed never actually had its stock decremented at
 * checkout (the old logic only checked stock, never reserved it) — this was
 * caught live: an early version of this function restored stock for
 * pre-existing pending test orders and inflated real variant stock counts
 * in the dev DB, since those orders had nothing to give back.
 */
export async function releaseExpiredCheckoutHolds(
  holdMinutes = CHECKOUT_HOLD_MINUTES,
): Promise<number> {
  const cutoff = new Date(Date.now() - holdMinutes * 60 * 1000);

  const expired = await db
    .update(orders)
    .set({ paymentStatus: "failed", updatedAt: new Date() })
    .where(and(eq(orders.paymentStatus, "pending"), lt(orders.createdAt, cutoff)))
    .returning({
      id: orders.id,
      orderNumber: orders.orderNumber,
      stockReserved: orders.stockReserved,
    });

  if (expired.length === 0) return 0;

  const reservedOrders = expired.filter((o) => o.stockReserved);
  if (reservedOrders.length > 0) {
    const items = await db
      .select({
        orderId: orderItems.orderId,
        variantId: orderItems.variantId,
        quantity: orderItems.quantity,
      })
      .from(orderItems)
      .where(inArray(orderItems.orderId, reservedOrders.map((o) => o.id)));

    for (const order of reservedOrders) {
      const lines = items
        .filter((i) => i.orderId === order.id)
        .map((i) => ({ variantId: i.variantId, quantity: i.quantity }));
      if (lines.length > 0) {
        await applyStockMovement(lines, 1, "return", order.orderNumber);
      }
    }
  }

  return expired.length;
}

/**
 * Records a processed Razorpay refund:
 *  - flips the order to "refunded" (full) or "partially_refunded"
 *  - marks any return row carrying this refund id as "refunded"
 * Returns the order plus whether it was already fully refunded (webhook retry),
 * so the caller can avoid sending a duplicate refund email. Null if no order
 * matches the refunded payment.
 */
export async function recordRefund(params: {
  razorpayPaymentId: string;
  razorpayRefundId: string;
  amountRefundedPaise: number;
}): Promise<{ order: OrderRow; isDuplicate: boolean } | null> {
  const order = await getOrderByRazorpayPaymentId(params.razorpayPaymentId);
  if (!order) return null;

  const isDuplicate = order.paymentStatus === "refunded";

  const nextStatus =
    params.amountRefundedPaise >= order.total ? "refunded" : "partially_refunded";

  await db
    .update(orders)
    .set({ paymentStatus: nextStatus, updatedAt: new Date() })
    .where(eq(orders.id, order.id));

  // Resolve the return that triggered this refund (idempotent on retries).
  await db
    .update(returns)
    .set({ status: "refunded", resolvedAt: new Date() })
    .where(
      and(
        eq(returns.razorpayRefundId, params.razorpayRefundId),
        ne(returns.status, "refunded"),
      ),
    );

  return { order, isDuplicate };
}

/**
 * Permanently deletes orders that never completed payment (payment_status
 * "pending" or "failed") and are older than `staleDays`. Every checkout
 * attempt inserts a real order row before Razorpay even opens (see
 * initCheckout in lib/actions/checkout.ts), so an abandoned or declined
 * checkout otherwise sits in the admin order list forever. Orders that
 * reached "paid" — including ones later refunded, returned, or RTO'd by the
 * courier — are never touched by this filter, since they're all
 * payment_status "paid"/"refunded"/"partially_refunded", never
 * "pending"/"failed".
 *
 * Before actually deleting, every candidate that has a razorpayOrderId is
 * re-checked directly against Razorpay's own API — our own paymentStatus can
 * be wrong (a payment.captured webhook that never landed, e.g. a
 * misconfigured or missing RAZORPAY_WEBHOOK_SECRET, a real incident this
 * project already hit once) and this is the last chance to catch that before
 * the order — and everything that proves the customer actually paid — is
 * gone for good. A candidate is only deleted if Razorpay confirms it was
 * genuinely never paid, OR it never got far enough to have a
 * razorpayOrderId at all (nothing to check — no payment could exist).
 * Anything Razorpay says IS paid, or that the check itself fails to
 * determine (a transient API error), is left alone and reported separately
 * — deletion is the one place here that must fail closed, not open — and an
 * admin is alerted so a human can reconcile it by hand.
 *
 * message_log.order_id has no ON DELETE cascade, so any log row is detached
 * first — in practice a pending/failed order should never have one (every
 * WhatsApp template only fires after payment succeeds), but this keeps the
 * delete from ever failing on a stray row instead of silently skipping it.
 */
export async function deleteStaleUnpaidOrders(
  staleDays = 7,
): Promise<{
  deletedCount: number;
  orderNumbers: string[];
  heldForReviewCount: number;
  heldForReviewOrderNumbers: string[];
}> {
  const cutoff = new Date(Date.now() - staleDays * 24 * 60 * 60 * 1000);

  const stale = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      razorpayOrderId: orders.razorpayOrderId,
    })
    .from(orders)
    .where(
      and(
        inArray(orders.paymentStatus, ["pending", "failed"]),
        lt(orders.createdAt, cutoff),
      ),
    );

  if (stale.length === 0) {
    return { deletedCount: 0, orderNumbers: [], heldForReviewCount: 0, heldForReviewOrderNumbers: [] };
  }

  const safeToDelete: typeof stale = [];
  const heldForReview: typeof stale = [];

  for (const order of stale) {
    if (!order.razorpayOrderId) {
      // Checkout never even reached Razorpay — no payment could exist.
      safeToDelete.push(order);
      continue;
    }
    try {
      const rpStatus = await fetchRazorpayOrderStatus(order.razorpayOrderId);
      if (rpStatus.status === "paid" || rpStatus.amountPaid > 0) {
        heldForReview.push(order);
      } else {
        safeToDelete.push(order);
      }
    } catch (err) {
      // Can't confirm it's safe — never guess in favor of an irreversible
      // delete. Leave it for the next run and flag it now.
      console.error(
        `[cleanup-orders] Razorpay status check failed for ${order.orderNumber} (${order.razorpayOrderId}) — holding, not deleting:`,
        err,
      );
      heldForReview.push(order);
    }
  }

  if (heldForReview.length > 0) {
    await alertAdminSuspiciousActivity({
      event: "Stale-order cleanup held orders back for manual review",
      detail: `${heldForReview.length} order(s) marked pending/failed locally but Razorpay shows as paid (or their status couldn't be confirmed), so they were NOT deleted: ${heldForReview.map((o) => o.orderNumber).join(", ")}. Check /studio/orders and reconcile payment status by hand.`,
    }).catch((err) => {
      console.error("[cleanup-orders] failed to alert admin about held orders:", err);
    });
  }

  if (safeToDelete.length === 0) {
    return {
      deletedCount: 0,
      orderNumbers: [],
      heldForReviewCount: heldForReview.length,
      heldForReviewOrderNumbers: heldForReview.map((o) => o.orderNumber),
    };
  }

  const ids = safeToDelete.map((o) => o.id);

  await db
    .update(messageLog)
    .set({ orderId: null })
    .where(inArray(messageLog.orderId, ids));

  await db.delete(orders).where(inArray(orders.id, ids));

  return {
    deletedCount: ids.length,
    orderNumbers: safeToDelete.map((o) => o.orderNumber),
    heldForReviewCount: heldForReview.length,
    heldForReviewOrderNumbers: heldForReview.map((o) => o.orderNumber),
  };
}

/**
 * Transforms a DB order into the shape the invoice PDF template expects.
 * Prices in DB are stored as paise (integer), GST-inclusive.
 */
export function buildInvoiceData(
  order: OrderWithItems,
  invoiceNumber: string,
): InvoiceData {
  const shipping = order.shippingAddress as {
    fullName: string;
    phone: string;
    line1: string;
    line2?: string;
    city: string;
    state: string;
    pincode: string;
  };

  const interState = isInterStateOrder(shipping.state);
  const gst = calculateOrderGst(
    order.orderItems.map((item) => ({
      unitPrice: item.unitPriceSnapshot,
      quantity: item.quantity,
      lineTotal: item.lineTotal,
    })),
    order.discount,
    interState,
  );

  const fmt = (d: Date) =>
    d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

  return {
    invoiceNumber,
    // order.placedAt is set once, at the same moment invoiceNumber is
    // assigned (see markOrderPaid) — using "now" here instead was fine for
    // the original webhook-triggered PDF (runs moments after placedAt) but
    // wrong for reprints/batch-print, which call this same function for
    // orders paid long ago. Falls back to "now" only in the type-level case
    // of an order this function should never see un-paid.
    invoiceDate: fmt(order.placedAt ?? new Date()),
    orderNumber: order.orderNumber,
    orderDate: fmt(order.createdAt),
    customer: {
      name: shipping.fullName,
      email: order.email,
      phone: order.phone,
      gstin: order.gstNumber,
      address: {
        line1: shipping.line1,
        line2: shipping.line2,
        city: shipping.city,
        state: shipping.state,
        pincode: shipping.pincode,
      },
    },
    items: order.orderItems.map((item, i) => ({
      description: item.productTitleSnapshot,
      size: item.variantLabelSnapshot,
      sku: item.skuSnapshot,
      quantity: item.quantity,
      unitPrice: item.unitPriceSnapshot,
      lineTotal: item.lineTotal,
      gstRatePercent: gst.lines[i].gstRatePercent,
    })),
    subtotal: order.subtotal,
    discount: order.discount,
    shippingFee: order.shippingFee,
    isInterState: interState,
    rateBreakdown: gst.rateBreakdown,
    taxableAmount: gst.taxableAmount,
    cgst: gst.cgst,
    sgst: gst.sgst,
    igst: gst.igst,
    total: order.total,
  };
}
