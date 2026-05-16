import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { InvoiceData } from "@/lib/invoice/generate";
import { calculateGst, isInterStateOrder } from "@/lib/invoice/generate";

const { orders, orderItems } = schema;

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
  const { taxableAmount, cgst, sgst, igst } = calculateGst(
    order.subtotal - order.discount,
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
      address: {
        line1: shipping.line1,
        line2: shipping.line2,
        city: shipping.city,
        state: shipping.state,
        pincode: shipping.pincode,
      },
    },
    items: order.orderItems.map((item) => ({
      description: item.productTitleSnapshot,
      size: item.variantLabelSnapshot,
      sku: item.skuSnapshot,
      quantity: item.quantity,
      unitPrice: item.unitPriceSnapshot,
      lineTotal: item.lineTotal,
    })),
    subtotal: order.subtotal,
    discount: order.discount,
    shippingFee: order.shippingFee,
    taxableAmount,
    isInterState: interState,
    cgst,
    sgst,
    igst,
    total: order.total,
  };
}
