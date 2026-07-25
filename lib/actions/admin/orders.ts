"use server";

import { and, desc, eq, gte, ilike, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { requireAdmin } from "@/lib/actions/auth";
import { generateInvoicePdf, generateInvoicePdfBatch } from "@/lib/invoice/generate";
import { buildInvoiceData } from "@/lib/db/queries/orders";
import { sendEmail } from "@/lib/resend";
import { applyStockMovement } from "@/lib/db/queries/inventory";
import { ActionError } from "@/lib/action-error";
import { logAdminAction } from "@/lib/audit/log-admin-action";
import { alertAdminSuspiciousActivity } from "@/lib/security/alert-admin";
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

  const fromStatus = existing[0].fulfillmentStatus;
  assertValidTransition(fromStatus, newStatus);

  // Conditional on the exact fulfillment_status we just validated the
  // transition from — this is what actually closes the race, not the
  // validation above. Two concurrent requests (double-click, two admin
  // tabs) can both read the same starting status and both pass
  // assertValidTransition before either write lands; only the request whose
  // WHERE clause still matches when it reaches Postgres actually flips the
  // row. The loser gets zero rows back from .returning() and must bail out
  // before running the restock branch below — same "only proceed if this
  // specific update actually changed a row" pattern as
  // markOrderPaid/incrementCouponUsage in lib/db/queries/orders.ts.
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
    .where(and(eq(orders.id, orderId), eq(orders.fulfillmentStatus, fromStatus)))
    .returning();

  if (!updated) {
    throw new ActionError(
      "Order status changed since this page loaded — refresh and try again",
    );
  }

  // Cancelling a paid order restores the stock the Razorpay webhook removed
  // on capture — the goods never left the warehouse. An order cancelled
  // before payment completed never had stock decremented, so there's
  // nothing to give back.
  //
  // Also gated on `fromStatus !== newStatus` — canTransitionFulfillment
  // treats a same-status call as a valid no-op transition (by design, for
  // idempotent webhook resends), so a *fully sequential* second "Cancel"
  // click — the first request already completed and committed before the
  // second one is even sent, not a byte-exact overlap — would read
  // fromStatus "cancelled" fresh, and the WHERE clause above would then
  // genuinely match "cancelled" again (it's not a stale read, that really
  // is the row's current value), returning a row from `updated` a second
  // time. Without this extra check the WHERE-clause guard above only
  // closes the perfectly-overlapping-request race, not the equally-likely
  // "click, then click again a moment later" case the finding is actually
  // named after — confirmed live: a strictly sequential second call still
  // matched the WHERE clause and re-ran this branch before this guard was
  // added. Requiring a genuine state change closes both.
  if (
    fromStatus !== newStatus &&
    newStatus === "cancelled" &&
    existing[0].paymentStatus === "paid"
  ) {
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
 * Attach a courier AWB number (after admin creates the shipment manually, or
 * to recover from a "PENDING" claim left behind by a failed
 * createDelhiveryShipment rollback — see that function's catch block). This
 * is the point at which the order is considered "shipped" — so we move the
 * status forward automatically.
 *
 * Blocks silently overwriting an already-attached real AWB by default — a
 * genuine duplicate/data-corruption bug found live in the dev DB: order
 * AARNA-001034 ended up with awb_number "5517341000004455173410000044", two
 * real waybills ("55173410000044") concatenated into one string, because
 * this action previously had no check at all and the admin UI's input
 * starts pre-filled with the existing AWB — nothing stopped submitting a
 * second attach over it. Pass `{ replace: true }` for the one legitimate
 * case, correcting a mistake — the UI surfaces that as an explicit,
 * separately-confirmed "Replace shipment" action, not the same "Attach"
 * button silently allowing it.
 */
export async function attachAwbNumber(
  orderId: string,
  awbNumber: string,
  options?: { replace?: boolean },
) {
  const admin = await requireAdmin();

  const existing = await db
    .select({
      fulfillmentStatus: orders.fulfillmentStatus,
      orderNumber: orders.orderNumber,
      awbNumber: orders.awbNumber,
    })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);

  if (!existing[0]) throw new ActionError("Order not found");

  const trimmed = awbNumber.trim();
  if (!trimmed) throw new ActionError("AWB number is required");

  const currentAwb = existing[0].awbNumber;
  // "PENDING" is createDelhiveryShipment's internal claim sentinel, not a
  // real shipment — attaching over it is the legitimate recovery path, not
  // a replace.
  const hasRealAwb = !!currentAwb && currentAwb !== "PENDING";

  if (hasRealAwb && !options?.replace) {
    throw new ActionError(
      trimmed === currentAwb
        ? `This order already has this AWB attached (${currentAwb}).`
        : `This order already has a shipment attached — AWB: ${currentAwb}. Use "Replace shipment" to override.`,
    );
  }

  const willMoveToShipped = existing[0].fulfillmentStatus === "processing";

  // Conditional on the SAME "may I write" check re-evaluated at the instant
  // of the write, not just the SELECT above — otherwise two concurrent
  // attach attempts could both pass the check above and both write, the
  // second one silently overwriting the first with no error to either
  // admin. Mirrors the atomic-claim pattern createDelhiveryShipment already
  // uses for the same reason.
  const [updated] = await db
    .update(orders)
    .set({
      awbNumber: trimmed,
      ...(willMoveToShipped && { fulfillmentStatus: "shipped" }),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(orders.id, orderId),
        hasRealAwb
          ? eq(orders.awbNumber, currentAwb)
          : or(isNull(orders.awbNumber), eq(orders.awbNumber, "PENDING")),
      ),
    )
    .returning();

  if (!updated) {
    throw new ActionError(
      "This order's shipment changed while you were editing it — refresh and try again.",
    );
  }

  revalidatePath("/studio/orders");
  revalidatePath(`/studio/orders/${existing[0].orderNumber}`);
  revalidatePath("/account/orders");

  await logAdminAction(admin.id, "order.attach_awb", "order", orderId, {
    awbNumber: trimmed,
    ...(hasRealAwb && { replacedAwb: currentAwb }),
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

  // Atomically claim the order BEFORE calling Delhivery's real
  // waybill+manifest API. The order.awbNumber check above is just a
  // fast-path/friendly-error check — on its own it doesn't stop two
  // near-simultaneous clicks (double-click, two admin tabs) from both
  // passing it and both calling Delhivery, booking two physical pickups for
  // one order. This conditional UPDATE is the actual lock: only the request
  // whose WHERE clause still matches (awb_number still NULL) claims the
  // order with a "PENDING" sentinel; the loser gets zero rows back and
  // aborts before ever touching Delhivery.
  const claimed = await db
    .update(orders)
    .set({ awbNumber: "PENDING", updatedAt: new Date() })
    .where(and(eq(orders.id, orderId), isNull(orders.awbNumber)))
    .returning({ id: orders.id });

  if (claimed.length === 0) {
    throw new ActionError(
      "Shipment creation is already in progress for this order — refresh and try again",
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

  try {
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

    const requestedWaybill = await fetchWaybill();

    // createShipment validates Delhivery's response and throws if the
    // shipment was actually rejected (see lib/delhivery/index.ts) — the
    // returned waybill is what Delhivery confirmed, which should match
    // requestedWaybill but is trusted over it as the source of truth for
    // what was really created.
    const { waybill } = await createShipment({
      orderNumber: order.orderNumber,
      waybill: requestedWaybill,
      name: shipping.fullName,
      address: [shipping.line1, shipping.line2].filter(Boolean).join(", "),
      pincode: shipping.pincode,
      city: shipping.city,
      state: shipping.state,
      phone: shipping.phone,
      totalAmount: Math.round(order.total / 100), // Delhivery expects rupees
      weightGrams: Math.max(weightGrams, 100),
    });

    // Conditional on both the "PENDING" claim AND the fulfillment_status
    // still being what it was when we claimed the order — the claim above
    // only stops a second createDelhiveryShipment call from racing this
    // one; it does nothing to stop an entirely different admin action
    // (cancelling this same order) from landing while the slow Delhivery
    // API call above was in flight. Cancel doesn't touch awb_number at all
    // (see updateOrderFulfillmentStatus), so checking awb_number alone
    // here would NOT catch that — a concurrently-cancelled order would
    // still match "PENDING" and this write would silently flip
    // fulfillment_status from "cancelled" back to "shipped", resurrecting
    // an order everyone was just told was cancelled (and which already had
    // its stock restored by that same cancel).
    const [updated] = await db
      .update(orders)
      .set({
        awbNumber: waybill,
        fulfillmentStatus: "shipped",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(orders.id, orderId),
          eq(orders.awbNumber, "PENDING"),
          inArray(orders.fulfillmentStatus, ["processing", "pending"]),
        ),
      )
      .returning();

    if (!updated) {
      // The Delhivery shipment is real and already booked — waybill is a
      // genuine external side effect that already happened — but the order
      // changed state (almost certainly cancelled) while that API call was
      // in flight, so it was deliberately NOT recorded on the order rather
      // than silently overwriting whatever its real current state is. This
      // needs a human, not a guess: same "flag for a human, don't guess"
      // principle as deleteStaleUnpaidOrders and the Delhivery RTO handler.
      console.error(
        `[admin] createDelhiveryShipment: order ${orderId} changed state before the final write — a real Delhivery shipment (AWB ${waybill}) was booked but NOT recorded on the order.`,
      );
      await alertAdminSuspiciousActivity({
        event: "Delhivery shipment booked for an order that changed state mid-request",
        detail: `Order ${order.orderNumber}: a real Delhivery pickup (AWB ${waybill}) was just booked, but the order's status changed — most likely it was cancelled — while that API call was in progress, so the AWB was deliberately NOT saved on the order. The shipment is real and needs manual reconciliation: check Delhivery's panel and /studio/orders/${order.orderNumber}.`,
      }).catch((alertErr) => {
        console.error("[admin] createDelhiveryShipment reconciliation alert failed:", alertErr);
      });
      throw new ActionError(
        `A Delhivery shipment (AWB ${waybill}) was created, but this order's status changed while that was in progress (it may have just been cancelled) — the shipment was not recorded and needs manual reconciliation. Check Delhivery's panel.`,
      );
    }

    revalidatePath("/studio/orders");
    revalidatePath(`/studio/orders/${order.orderNumber}`);
    revalidatePath("/account/orders");

    await logAdminAction(admin.id, "order.create_shipment", "order", orderId, {
      awbNumber: updated.awbNumber,
    });

    return updated;
  } catch (err) {
    // The Delhivery call (or something after it) failed — clear the
    // "PENDING" claim back to NULL so the order doesn't sit permanently
    // looking like it has a shipment when it doesn't, and so a retry can
    // actually claim it again. Only clears it if it's still our sentinel
    // (defensive — nothing else should be writing awb_number in this
    // window, but never clobber a real AWB that landed some other way).
    await db
      .update(orders)
      .set({ awbNumber: null, updatedAt: new Date() })
      .where(and(eq(orders.id, orderId), eq(orders.awbNumber, "PENDING")))
      .catch((rollbackErr) => {
        // If this rollback itself fails (plausible given this project's
        // documented recurring pooler flakiness), the order is stuck at
        // awb_number='PENDING' indefinitely — "PENDING" is truthy, so the
        // admin UI's own !order.awbNumber check permanently hides "Create
        // shipment" for this order with no automatic retry. There IS a
        // manual escape hatch (the always-visible "Attach AWB" field,
        // unconditional, not blocked by the sentinel), but nothing
        // previously told the admin they now need it — a silent
        // console.error is not a signal anyone will see in time.
        console.error(
          `[admin] failed to roll back PENDING awb claim for order ${orderId} after shipment creation failure:`,
          rollbackErr,
        );
        alertAdminSuspiciousActivity({
          event: "Order stuck with a PENDING shipment claim after a failed rollback",
          detail: `Order ${order.orderNumber}: shipment creation failed and the follow-up cleanup (clearing the temporary "PENDING" AWB claim) also failed, so the order is now stuck showing a shipment claim it doesn't really have — "Create shipment" won't reappear for it. Use the "Attach AWB" field on /studio/orders/${order.orderNumber} to recover (or retry after the underlying issue clears).`,
        }).catch((alertErr) => {
          console.error("[admin] rollback-failure alert itself failed:", alertErr);
        });
      });
    throw err;
  }
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
  const admin = await requireAdmin();

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

  const pdf = await generateInvoicePdfBatch(invoiceDataList);

  // This reads full names, addresses, phone numbers, emails, and GSTINs for
  // up to MAX_BATCH_INVOICES orders and hands them back as a download —
  // every other mutating action in this file logs to the admin audit trail,
  // and a bulk PII export is exactly the kind of action that trail exists
  // for. No single entityId (this spans many orders), same "reorder"-style
  // batch shape as banner.reorder/category.reorder elsewhere in this repo.
  await logAdminAction(admin.id, "order.invoices_batch_print", "order", null, {
    orderIds,
    count: invoiceDataList.length,
  });

  return pdf;
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
