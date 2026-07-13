"use server";

import { and, desc, eq, gte, ilike, inArray, lte, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { requireAdmin } from "@/lib/actions/auth";
import { generateInvoicePdf } from "@/lib/invoice/generate";
import { buildInvoiceData } from "@/lib/db/queries/orders";
import { ActionError } from "@/lib/action-error";

const { orders, orderItems, productImages, productVariants } = schema;

type FulfillmentStatus =
  | "pending"
  | "processing"
  | "shipped"
  | "out_for_delivery"
  | "delivered"
  | "cancelled"
  | "returned";

type PaymentStatus = "pending" | "paid" | "failed" | "refunded" | "partially_refunded";

// Valid forward-only transitions for fulfillment status.
// Admin can step forward through this list. Cancellation is only allowed from
// the early states (before shipping). Returns flow through the returns table.
const FORWARD_TRANSITIONS: Record<FulfillmentStatus, FulfillmentStatus[]> = {
  pending: ["processing", "cancelled"],
  processing: ["shipped", "cancelled"],
  shipped: ["out_for_delivery"],
  out_for_delivery: ["delivered"],
  delivered: [], // returns are handled via the returns flow, not by editing the order
  cancelled: [],
  returned: [],
};

function assertValidTransition(from: FulfillmentStatus, to: FulfillmentStatus) {
  if (from === to) return;
  const allowed = FORWARD_TRANSITIONS[from];
  if (!allowed.includes(to)) {
    throw new ActionError(`Cannot move order from "${from}" to "${to}"`);
  }
}

// ── List ─────────────────────────────────────────────────────────────────────

export interface AdminOrderFilters {
  fulfillmentStatus?: FulfillmentStatus;
  paymentStatus?: PaymentStatus;
  search?: string; // matches orderNumber, email, or phone
  from?: Date;
  to?: Date;
  page?: number;
  pageSize?: number;
}

export interface AdminOrderListItem {
  id: string;
  orderNumber: string;
  email: string;
  phone: string;
  subtotal: number;
  discount: number;
  shippingFee: number;
  total: number;
  paymentStatus: PaymentStatus;
  fulfillmentStatus: FulfillmentStatus;
  invoiceNumber: string | null;
  awbNumber: string | null;
  placedAt: Date | null;
  createdAt: Date;
  itemCount: number;
}

export interface AdminOrderListResult {
  items: AdminOrderListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export async function getAdminOrders(
  filters: AdminOrderFilters = {},
): Promise<AdminOrderListResult> {
  await requireAdmin();

  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.max(1, Math.min(100, filters.pageSize ?? 25));
  const offset = (page - 1) * pageSize;

  const conditions = [];
  if (filters.fulfillmentStatus) {
    conditions.push(eq(orders.fulfillmentStatus, filters.fulfillmentStatus));
  }
  if (filters.paymentStatus) {
    conditions.push(eq(orders.paymentStatus, filters.paymentStatus));
  }
  if (filters.from) conditions.push(gte(orders.createdAt, filters.from));
  if (filters.to) conditions.push(lte(orders.createdAt, filters.to));
  if (filters.search?.trim()) {
    const q = `%${filters.search.trim()}%`;
    conditions.push(
      or(
        ilike(orders.orderNumber, q),
        ilike(orders.email, q),
        ilike(orders.phone, q),
      )!,
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [orderRows, totalRows] = await Promise.all([
    db
      .select()
      .from(orders)
      .where(whereClause)
      .orderBy(desc(orders.createdAt))
      .limit(pageSize)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(orders)
      .where(whereClause),
  ]);

  if (orderRows.length === 0) {
    return { items: [], total: totalRows[0]?.count ?? 0, page, pageSize };
  }

  // Batch the item-count subquery
  const orderIds = orderRows.map((o) => o.id);
  const itemCounts = await db
    .select({
      orderId: orderItems.orderId,
      count: sql<number>`sum(${orderItems.quantity})::int`,
    })
    .from(orderItems)
    .where(inArray(orderItems.orderId, orderIds))
    .groupBy(orderItems.orderId);
  const countByOrder = new Map(itemCounts.map((r) => [r.orderId, r.count]));

  const items: AdminOrderListItem[] = orderRows.map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    email: o.email,
    phone: o.phone,
    subtotal: o.subtotal,
    discount: o.discount,
    shippingFee: o.shippingFee,
    total: o.total,
    paymentStatus: o.paymentStatus,
    fulfillmentStatus: o.fulfillmentStatus,
    invoiceNumber: o.invoiceNumber,
    awbNumber: o.awbNumber,
    placedAt: o.placedAt,
    createdAt: o.createdAt,
    itemCount: countByOrder.get(o.id) ?? 0,
  }));

  return { items, total: totalRows[0]?.count ?? 0, page, pageSize };
}

// ── Detail ───────────────────────────────────────────────────────────────────

export async function getAdminOrderDetail(idOrOrderNumber: string) {
  await requireAdmin();

  // Try lookup by id first, fall back to order number
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      idOrOrderNumber,
    );

  const order = await db
    .select()
    .from(orders)
    .where(
      isUuid
        ? eq(orders.id, idOrOrderNumber)
        : eq(orders.orderNumber, idOrOrderNumber),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!order) return null;

  // Items + first image per product (for visual order summary in admin)
  const items = await db
    .select({
      id: orderItems.id,
      variantId: orderItems.variantId,
      productTitleSnapshot: orderItems.productTitleSnapshot,
      variantLabelSnapshot: orderItems.variantLabelSnapshot,
      skuSnapshot: orderItems.skuSnapshot,
      unitPriceSnapshot: orderItems.unitPriceSnapshot,
      quantity: orderItems.quantity,
      lineTotal: orderItems.lineTotal,
      productId: productVariants.productId,
    })
    .from(orderItems)
    .leftJoin(productVariants, eq(productVariants.id, orderItems.variantId))
    .where(eq(orderItems.orderId, order.id));

  const productIds = items
    .map((i) => i.productId)
    .filter((id): id is string => id !== null);

  const imageRows =
    productIds.length > 0
      ? await db
          .select({
            productId: productImages.productId,
            url: productImages.url,
            sortOrder: productImages.sortOrder,
          })
          .from(productImages)
          .where(inArray(productImages.productId, productIds))
      : [];

  const imageByProduct = new Map<string, string>();
  for (const img of imageRows.sort((a, b) => a.sortOrder - b.sortOrder)) {
    if (!imageByProduct.has(img.productId))
      imageByProduct.set(img.productId, img.url);
  }

  const hydratedItems = items.map((i) => ({
    id: i.id,
    variantId: i.variantId,
    productTitle: i.productTitleSnapshot,
    variantLabel: i.variantLabelSnapshot,
    sku: i.skuSnapshot,
    unitPrice: i.unitPriceSnapshot,
    quantity: i.quantity,
    lineTotal: i.lineTotal,
    imageUrl: i.productId ? imageByProduct.get(i.productId) ?? null : null,
  }));

  return { ...order, items: hydratedItems };
}

// ── Status updates ───────────────────────────────────────────────────────────

export async function updateOrderFulfillmentStatus(
  orderId: string,
  newStatus: FulfillmentStatus,
) {
  await requireAdmin();

  const existing = await db
    .select({
      fulfillmentStatus: orders.fulfillmentStatus,
      orderNumber: orders.orderNumber,
    })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);

  if (!existing[0]) throw new ActionError("Order not found");

  assertValidTransition(existing[0].fulfillmentStatus, newStatus);

  const [updated] = await db
    .update(orders)
    .set({ fulfillmentStatus: newStatus, updatedAt: new Date() })
    .where(eq(orders.id, orderId))
    .returning();

  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${existing[0].orderNumber}`);
  revalidatePath("/account/orders"); // customer-facing order list
  return updated;
}

/**
 * Attach a courier AWB number (after admin creates the shipment). This is the
 * point at which the order is considered "shipped" — so we move the status
 * forward automatically.
 */
export async function attachAwbNumber(orderId: string, awbNumber: string) {
  await requireAdmin();

  const existing = await db
    .select({ fulfillmentStatus: orders.fulfillmentStatus, orderNumber: orders.orderNumber })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);

  if (!existing[0]) throw new ActionError("Order not found");

  const trimmed = awbNumber.trim();
  if (!trimmed) throw new ActionError("AWB number is required");

  const willMoveToShipped = existing[0].fulfillmentStatus === "processing";

  const [updated] = await db
    .update(orders)
    .set({
      awbNumber: trimmed,
      ...(willMoveToShipped && { fulfillmentStatus: "shipped" }),
      updatedAt: new Date(),
    })
    .where(eq(orders.id, orderId))
    .returning();

  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${existing[0].orderNumber}`);
  revalidatePath("/account/orders");
  return updated;
}

// ── Shipment creation (Delhivery) ────────────────────────────────────────────

const FALLBACK_ITEM_WEIGHT_GRAMS = 450; // typical garment when variant has no weight

/**
 * Creates the Delhivery forward shipment for a paid order and attaches the
 * AWB. This is the "Create shipment" button on the admin order detail page.
 *
 * Flow: allocate waybill → manifest shipment with the order's shipping
 * address → save AWB on the order (auto-advances processing → shipped).
 * Delhivery then owns pickup + all customer shipping notifications.
 */
export async function createDelhiveryShipment(orderId: string) {
  await requireAdmin();

  const order = await db
    .select()
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!order) throw new ActionError("Order not found");
  if (order.paymentStatus !== "paid") {
    throw new ActionError("Order is not paid — cannot create a shipment");
  }
  if (order.awbNumber) {
    throw new ActionError(`Shipment already exists (AWB ${order.awbNumber})`);
  }
  if (
    order.fulfillmentStatus !== "processing" &&
    order.fulfillmentStatus !== "pending"
  ) {
    throw new ActionError(
      `Cannot create a shipment for an order in "${order.fulfillmentStatus}" state`,
    );
  }

  const shipping = order.shippingAddress as {
    fullName: string;
    phone: string;
    line1: string;
    line2?: string;
    city: string;
    state: string;
    pincode: string;
  };

  // Total parcel weight = sum of variant weights × quantities (fallback per item)
  const items = await db
    .select({
      quantity: orderItems.quantity,
      weightGrams: productVariants.weightGrams,
    })
    .from(orderItems)
    .leftJoin(productVariants, eq(productVariants.id, orderItems.variantId))
    .where(eq(orderItems.orderId, order.id));

  const weightGrams = items.reduce(
    (sum, i) => sum + (i.weightGrams ?? FALLBACK_ITEM_WEIGHT_GRAMS) * i.quantity,
    0,
  );

  const { fetchWaybill, createShipment } = await import("@/lib/delhivery");

  const waybill = await fetchWaybill();

  await createShipment({
    orderNumber: order.orderNumber,
    waybill,
    name: shipping.fullName,
    address: [shipping.line1, shipping.line2].filter(Boolean).join(", "),
    pincode: shipping.pincode,
    city: shipping.city,
    state: shipping.state,
    phone: shipping.phone,
    totalAmount: Math.round(order.total / 100), // Delhivery expects rupees
    weightGrams: Math.max(weightGrams, 100),
  });

  const [updated] = await db
    .update(orders)
    .set({
      awbNumber: waybill,
      fulfillmentStatus: "shipped",
      updatedAt: new Date(),
    })
    .where(eq(orders.id, orderId))
    .returning();

  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${order.orderNumber}`);
  revalidatePath("/account/orders");
  return updated;
}

// ── Invoice ──────────────────────────────────────────────────────────────────

/**
 * Re-generates the invoice PDF for an existing order. Returns the buffer for
 * download or email re-send. The order must already have an invoice number
 * (set by the Razorpay webhook on payment.captured).
 */
export async function regenerateInvoicePdf(orderId: string): Promise<Buffer> {
  await requireAdmin();

  const order = await db
    .select()
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!order) throw new ActionError("Order not found");
  if (!order.invoiceNumber) {
    throw new ActionError(
      "Order has no invoice number — invoice is generated when payment is captured.",
    );
  }

  const items = await db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, order.id));

  const invoiceData = buildInvoiceData(
    { ...order, orderItems: items },
    order.invoiceNumber,
  );
  return generateInvoicePdf(invoiceData);
}

// ── Stats (for admin dashboard) ──────────────────────────────────────────────

export async function getOrderStats(daysBack = 30) {
  await requireAdmin();

  const since = new Date();
  since.setDate(since.getDate() - daysBack);

  const rows = await db
    .select({
      fulfillmentStatus: orders.fulfillmentStatus,
      paymentStatus: orders.paymentStatus,
      total: orders.total,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .where(gte(orders.createdAt, since));

  const counts: Record<FulfillmentStatus, number> = {
    pending: 0,
    processing: 0,
    shipped: 0,
    out_for_delivery: 0,
    delivered: 0,
    cancelled: 0,
    returned: 0,
  };
  let revenue = 0;
  let paidCount = 0;

  for (const row of rows) {
    counts[row.fulfillmentStatus] += 1;
    if (row.paymentStatus === "paid") {
      revenue += row.total;
      paidCount += 1;
    }
  }

  return {
    daysBack,
    totalOrders: rows.length,
    paidOrders: paidCount,
    totalRevenue: revenue,
    byFulfillmentStatus: counts,
  };
}
