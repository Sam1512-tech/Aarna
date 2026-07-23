import { and, eq, inArray, lt, ne } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { InvoiceData } from "@/lib/invoice/generate";
import { calculateOrderGst, isInterStateOrder } from "@/lib/invoice/generate";
import { applyStockMovement } from "@/lib/db/queries/inventory";
import { fetchRazorpayOrderStatus } from "@/lib/razorpay";
import { alertAdminSuspiciousActivity } from "@/lib/security/alert-admin";

const { orders, orderItems, returns, carts, cartItems, messageLog } = schema;

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

export async function markOrderPaid(
  orderId: string,
  invoiceNumber: string,
  razorpayPaymentId: string,
) {
  await db
    .update(orders)
    .set({
      invoiceNumber,
      razorpayPaymentId,
      paymentStatus: "paid",
      fulfillmentStatus: "processing",
      placedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(orders.id, orderId));
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
    invoiceDate: fmt(new Date()),
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
