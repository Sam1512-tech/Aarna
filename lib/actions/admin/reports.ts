"use server";

import { and, asc, eq, gte, inArray, isNotNull, lt } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireAdmin } from "@/lib/actions/auth";
import { calculateOrderGst, isInterStateOrder } from "@/lib/invoice/generate";
import { assertReportRangeWithinCap } from "@/lib/reports/date-range";

const { orders, orderItems, creditNotes } = schema;

interface ShippingAddress {
  fullName: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  pincode: string;
}

function fmtIstDate(d: Date): string {
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

// ── General sales report ────────────────────────────────────────────────────
// One row per order, whatever its status — this is a business overview, not
// a tax document, so pending/failed/cancelled orders are included with clear
// status columns rather than silently dropped.

export interface GeneralSalesRow {
  orderNumber: string;
  orderDate: string;
  customerName: string;
  email: string;
  phone: string;
  itemCount: number;
  subtotal: number;
  discount: number;
  shippingFee: number;
  total: number;
  couponCode: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  invoiceNumber: string;
  awbNumber: string;
}

export async function getGeneralSalesReportRows(
  from: Date,
  to: Date,
): Promise<GeneralSalesRow[]> {
  await requireAdmin();
  assertReportRangeWithinCap(from, to);

  const orderRows = await db
    .select()
    .from(orders)
    .where(and(gte(orders.createdAt, from), lt(orders.createdAt, to)))
    .orderBy(asc(orders.createdAt));

  if (orderRows.length === 0) return [];

  const orderIds = orderRows.map((o) => o.id);
  const items = await db
    .select({ orderId: orderItems.orderId, quantity: orderItems.quantity })
    .from(orderItems)
    .where(inArray(orderItems.orderId, orderIds));

  const itemCountByOrder = new Map<string, number>();
  for (const item of items) {
    itemCountByOrder.set(
      item.orderId,
      (itemCountByOrder.get(item.orderId) ?? 0) + item.quantity,
    );
  }

  return orderRows.map((o) => {
    const shipping = o.shippingAddress as ShippingAddress;
    return {
      orderNumber: o.orderNumber,
      orderDate: fmtIstDate(o.createdAt),
      customerName: shipping?.fullName ?? "—",
      email: o.email,
      phone: o.phone,
      itemCount: itemCountByOrder.get(o.id) ?? 0,
      subtotal: o.subtotal / 100,
      discount: o.discount / 100,
      shippingFee: o.shippingFee / 100,
      total: o.total / 100,
      couponCode: o.couponCode ?? "",
      paymentStatus: o.paymentStatus,
      fulfillmentStatus: o.fulfillmentStatus,
      invoiceNumber: o.invoiceNumber ?? "",
      awbNumber: o.awbNumber ?? "",
    };
  });
}

// ── GST sales register ──────────────────────────────────────────────────────
// One row per order PER GST rate present (an order can legitimately mix 5%
// and 18% lines — see lib/gst.ts) — this is the exact shape an accountant
// needs to file GSTR-1/GSTR-3B, so it only includes orders that actually
// have an invoice (placedAt is set exactly once, in the payment.captured
// webhook, at the same moment invoiceNumber is assigned — see
// lib/db/queries/orders.ts markOrderPaid). Orders that never completed
// payment never had GST liability, so they're correctly excluded.
//
// Note: this reflects original invoice values only. A refunded order still
// appears (the original supply was taxed), but proper GST filing for a
// refund needs a credit note, which this report doesn't generate — flag any
// refunded rows to the accountant separately.

export interface GstRegisterRow {
  invoiceNumber: string;
  invoiceDate: string;
  orderNumber: string;
  customerName: string;
  customerGstin: string;
  placeOfSupply: string;
  supplyType: "Intra-state" | "Inter-state";
  hsnCode: string;
  gstRatePercent: number;
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
  paymentStatus: string;
}

export async function getGstSalesRegisterRows(
  from: Date,
  to: Date,
): Promise<GstRegisterRow[]> {
  await requireAdmin();
  assertReportRangeWithinCap(from, to);

  const orderRows = await db
    .select()
    .from(orders)
    .where(
      and(
        isNotNull(orders.placedAt),
        gte(orders.placedAt, from),
        lt(orders.placedAt, to),
      ),
    )
    .orderBy(asc(orders.placedAt));

  if (orderRows.length === 0) return [];

  const orderIds = orderRows.map((o) => o.id);
  const items = await db
    .select()
    .from(orderItems)
    .where(inArray(orderItems.orderId, orderIds));

  const itemsByOrder = new Map<string, typeof items>();
  for (const item of items) {
    if (!itemsByOrder.has(item.orderId)) itemsByOrder.set(item.orderId, []);
    itemsByOrder.get(item.orderId)!.push(item);
  }

  const rows: GstRegisterRow[] = [];
  for (const o of orderRows) {
    const orderItemRows = itemsByOrder.get(o.id) ?? [];
    if (orderItemRows.length === 0) continue;

    const shipping = o.shippingAddress as ShippingAddress;
    const interState = isInterStateOrder(shipping?.state ?? "");
    const gst = calculateOrderGst(
      orderItemRows.map((item) => ({
        unitPrice: item.unitPriceSnapshot,
        quantity: item.quantity,
        lineTotal: item.lineTotal,
      })),
      o.discount,
      interState,
    );

    for (const bucket of gst.rateBreakdown) {
      rows.push({
        invoiceNumber: o.invoiceNumber ?? "",
        invoiceDate: o.placedAt ? fmtIstDate(o.placedAt) : "",
        orderNumber: o.orderNumber,
        customerName: shipping?.fullName ?? "—",
        customerGstin: o.gstNumber ?? "",
        placeOfSupply: shipping?.state ?? "",
        supplyType: interState ? "Inter-state" : "Intra-state",
        hsnCode: "6211",
        gstRatePercent: bucket.ratePercent,
        taxableValue: bucket.taxableAmount / 100,
        cgst: bucket.cgst / 100,
        sgst: bucket.sgst / 100,
        igst: bucket.igst / 100,
        total: (bucket.taxableAmount + bucket.cgst + bucket.sgst + bucket.igst) / 100,
        paymentStatus: o.paymentStatus,
      });
    }
  }

  return rows;
}

// ── GST credit notes register ───────────────────────────────────────────────
// The other half of GST filing the sales register alone can't cover — every
// refund reduces output GST liability via a credit note (Section 34, CGST
// Act), reported separately in GSTR-1's credit/debit-note table rather than
// blended into the sales figures. See lib/db/schema.ts's creditNotes comment
// and lib/db/queries/orders.ts's recordRefund for how these get created.

export interface GstCreditNoteRow {
  creditNoteNumber: string;
  creditNoteDate: string;
  originalInvoiceNumber: string;
  orderNumber: string;
  customerName: string;
  gstRatePercent: number;
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
  needsReview: string;
}

export async function getGstCreditNotesRegisterRows(
  from: Date,
  to: Date,
): Promise<GstCreditNoteRow[]> {
  await requireAdmin();
  assertReportRangeWithinCap(from, to);

  const rows = await db
    .select({
      creditNoteNumber: creditNotes.creditNoteNumber,
      createdAt: creditNotes.createdAt,
      rateBreakdown: creditNotes.rateBreakdown,
      needsReview: creditNotes.needsReview,
      invoiceNumber: orders.invoiceNumber,
      orderNumber: orders.orderNumber,
      shippingAddress: orders.shippingAddress,
    })
    .from(creditNotes)
    .innerJoin(orders, eq(orders.id, creditNotes.orderId))
    .where(and(gte(creditNotes.createdAt, from), lt(creditNotes.createdAt, to)))
    .orderBy(asc(creditNotes.createdAt));

  const out: GstCreditNoteRow[] = [];
  for (const r of rows) {
    const shipping = r.shippingAddress as { fullName?: string } | null;
    // One row per GST rate present in this credit note — same reason the
    // sales register itemizes rateBreakdown separately rather than blending
    // a mixed-rate refund into one number.
    for (const bucket of r.rateBreakdown) {
      out.push({
        creditNoteNumber: r.creditNoteNumber,
        creditNoteDate: fmtIstDate(r.createdAt),
        originalInvoiceNumber: r.invoiceNumber ?? "",
        orderNumber: r.orderNumber,
        customerName: shipping?.fullName ?? "—",
        gstRatePercent: bucket.ratePercent,
        taxableValue: bucket.taxableAmount / 100,
        cgst: bucket.cgst / 100,
        sgst: bucket.sgst / 100,
        igst: bucket.igst / 100,
        total: (bucket.taxableAmount + bucket.cgst + bucket.sgst + bucket.igst) / 100,
        needsReview: r.needsReview ? "Yes" : "No",
      });
    }
  }

  return out;
}
