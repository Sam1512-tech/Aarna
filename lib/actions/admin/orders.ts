"use server";

import { and, desc, eq, gte, ilike, inArray, lte, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { requireAdmin } from "@/lib/actions/auth";
import { generateInvoicePdf, generateInvoicePdfBatch } from "@/lib/invoice/generate";
import { buildInvoiceData } from "@/lib/db/queries/orders";
import { sendEmail } from "@/lib/resend";
import { applyStockMovement } from "@/lib/db/queries/inventory";
import { ActionError } from "@/lib/action-error";
import { logAdminAction } from "@/lib/audit/log-admin-action";
import {
  canTransitionFulfillment,
  type FulfillmentStatus,
} from "@/lib/orders/fulfillment-transitions";

const { orders, orderItems, productImages, productVariants } = schema;

type PaymentStatus = "pending" | "paid" | "failed" | "refunded" | "partially_refunded";

function assertValidTransition(from: FulfillmentStatus, to: FulfillmentStatus) {
  if (!canTransitionFulfillment(from, to)) {
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
  const admin = await requireAdmin();

  const existing = await db
    .select({
      fulfillmentStatus: orders.fulfillmentStatus,
      paymentStatus: orders.paymentStatus,
      orderNumber: orders.orderNumber,
    })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);

  if (!existing[0]) throw new ActionError("Order not found");

  assertValidTransition(existing[0].fulfillmentStatus, newStatus);

  const [updated] = await db
    .update(orders)
    .set({
      fulfillmentStatus: newStatus,
      updatedAt: new Date(),
      // coalesce — delivered: [] in FORWARD_TRANSITIONS means this can only
      // be reached once per order, but coalesce keeps it safe regardless.
      ...(newStatus === "delivered"
        ? { deliveredAt: sql`coalesce(${orders.deliveredAt}, now())` }
        : {}),
    })
    .where(eq(orders.id, orderId))
    .returning();

  // Cancelling a paid order restores the stock the Razorpay webhook removed
  // on capture — the goods never left the warehouse. An order cancelled
  // before payment completed never had stock decremented, so there's
  // nothing to give back.
  if (newStatus === "cancelled" && existing[0].paymentStatus === "paid") {
    const items = await db
      .select({ variantId: orderItems.variantId, quantity: orderItems.quantity })
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId));
    await applyStockMovement(items, 1, "return", existing[0].orderNumber);
  }

  revalidatePath("/studio/orders");
  revalidatePath(`/studio/orders/${existing[0].orderNumber}`);
  revalidatePath("/account/orders"); // customer-facing order list

  await logAdminAction(admin.id, "order.fulfillment_status_update", "order", orderId, {
    newStatus,
  });

  return updated;
}

/**
 * Attach a courier AWB number (after admin creates the shipment). This is the
 * point at which the order is considered "shipped" — so we move the status
 * forward automatically.
 */
export async function attachAwbNumber(orderId: string, awbNumber: string) {
  const admin = await requireAdmin();

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

  revalidatePath("/studio/orders");
  revalidatePath(`/studio/orders/${existing[0].orderNumber}`);
  revalidatePath("/account/orders");

  await logAdminAction(admin.id, "order.attach_awb", "order", orderId, {
    awbNumber,
  });

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
  const admin = await requireAdmin();

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

  revalidatePath("/studio/orders");
  revalidatePath(`/studio/orders/${order.orderNumber}`);
  revalidatePath("/account/orders");

  await logAdminAction(admin.id, "order.create_shipment", "order", orderId, {
    awbNumber: updated.awbNumber,
  });

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

/**
 * Manually re-sends the order-confirmation email (with invoice PDF
 * attached) for an already-paid order. The `payment.captured` webhook sends
 * this automatically, but that step is deliberately best-effort — a
 * transient failure there (a Resend outage, a PDF-rendering hiccup) never
 * blocks the payment itself, which means it can also leave a real customer
 * never having received their confirmation with no automatic retry. This is
 * the recovery path an admin uses once alerted to that (see the webhook's
 * own alertAdminSuspiciousActivity call), rather than the customer having to
 * notice and ask.
 */
export async function resendOrderConfirmationEmail(orderId: string): Promise<{ ok: true }> {
  const admin = await requireAdmin();

  const order = await db
    .select()
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!order) throw new ActionError("Order not found");
  if (order.paymentStatus !== "paid" && order.paymentStatus !== "partially_refunded") {
    throw new ActionError("Order hasn't been paid — nothing to send a confirmation for");
  }
  if (!order.invoiceNumber) {
    throw new ActionError(
      "Order has no invoice number — invoice is generated when payment is captured.",
    );
  }

  const items = await db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, order.id));

  const orderWithItems = { ...order, orderItems: items };
  const invoiceData = buildInvoiceData(orderWithItems, order.invoiceNumber);
  const pdfBuffer = await generateInvoicePdf(invoiceData);
  const pdfFilename = `${order.invoiceNumber.replace(/\//g, "-")}.pdf`;

  await sendEmail({
    to: order.email,
    subject: `Order Confirmed — ${order.orderNumber} | Aarna`,
    templateKey: "order_receipt",
    data: { order: orderWithItems, invoiceNumber: order.invoiceNumber },
    attachments: [{ filename: pdfFilename, content: pdfBuffer }],
  });

  await logAdminAction(admin.id, "order.resend_confirmation_email", "order", orderId, {
    email: order.email,
  });

  return { ok: true };
}

const MAX_BATCH_INVOICES = 200;

/**
 * Re-generates invoice PDFs for several orders at once, merged into a single
 * PDF (one page per invoice) — powers the "print selected invoices" action on
 * the admin orders list, so printing a batch is one file, not N downloads.
 * Orders without an invoice number (never paid) are silently skipped, same
 * as a single missing variant is skipped in generateHangTagsForVariants.
 */
export async function regenerateInvoicePdfBatch(orderIds: string[]): Promise<Buffer> {
  await requireAdmin();

  if (orderIds.length === 0) throw new ActionError("Pick at least one order");
  if (orderIds.length > MAX_BATCH_INVOICES) {
    throw new ActionError(`Pick ${MAX_BATCH_INVOICES} orders or fewer at a time`);
  }

  const [orderRows, itemRows] = await Promise.all([
    db.select().from(orders).where(inArray(orders.id, orderIds)),
    db.select().from(orderItems).where(inArray(orderItems.orderId, orderIds)),
  ]);

  const orderById = new Map(orderRows.map((o) => [o.id, o]));
  const itemsByOrder = new Map<string, typeof itemRows>();
  for (const item of itemRows) {
    const bucket = itemsByOrder.get(item.orderId);
    if (bucket) bucket.push(item);
    else itemsByOrder.set(item.orderId, [item]);
  }

  // Preserve the order the caller (the admin's selection) passed in, and
  // silently drop anything unpaid/missing rather than failing the whole batch.
  // buildInvoiceData can also throw on a single malformed order (e.g. a
  // legacy row with an incomplete shipping address, from before initCheckout
  // validated this server-side) — one bad row must not take down every other
  // PDF in the admin's selection, so each order gets its own try/catch
  // instead of one shared .map() that aborts on the first failure.
  const invoiceDataList = orderIds
    .map((id) => orderById.get(id))
    .filter((order) => order && order.invoiceNumber)
    .flatMap((order) => {
      try {
        return [
          buildInvoiceData(
            { ...order!, orderItems: itemsByOrder.get(order!.id) ?? [] },
            order!.invoiceNumber!,
          ),
        ];
      } catch (err) {
        console.error(
          `[admin] buildInvoiceData failed for order ${order!.orderNumber} in batch print — skipping:`,
          err,
        );
        return [];
      }
    });

  if (invoiceDataList.length === 0) {
    throw new ActionError(
      "None of the selected orders have an invoice yet — invoices are generated when payment is captured.",
    );
  }

  return generateInvoicePdfBatch(invoiceDataList);
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
