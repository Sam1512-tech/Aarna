import { and, eq, inArray, ne } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { InvoiceData } from "@/lib/invoice/generate";
import { calculateOrderGst, isInterStateOrder } from "@/lib/invoice/generate";

const { orders, orderItems, returns, carts, cartItems } = schema;

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
 * Marks a still-pending order as failed. No-op if the order was already paid
 * (a late payment.failed event must never override a successful capture).
 * Returns true if a row was actually updated.
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
    .returning({ id: orders.id });
  return updated.length > 0;
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
