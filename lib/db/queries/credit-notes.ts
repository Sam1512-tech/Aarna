import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { CreditNoteData } from "@/lib/credit-note/generate";
import { isInterStateOrder } from "@/lib/invoice/generate";

const { creditNotes, orders, returns } = schema;

export type CreditNoteRow = typeof creditNotes.$inferSelect;

/**
 * All credit notes for an order, newest first — an order can have more than
 * one if it was refunded across multiple separate events (one per returned
 * item, the normal shape once returns are processed per item — same reason
 * order_refund_events can hold more than one row per order).
 */
export async function getCreditNotesForOrder(orderId: string): Promise<CreditNoteRow[]> {
  return db
    .select()
    .from(creditNotes)
    .where(eq(creditNotes.orderId, orderId))
    .orderBy(desc(creditNotes.createdAt));
}

export async function getCreditNoteById(id: string): Promise<CreditNoteRow | null> {
  const [row] = await db.select().from(creditNotes).where(eq(creditNotes.id, id)).limit(1);
  return row ?? null;
}

/**
 * Transforms a credit note DB row (plus its order, and its return's reason
 * if it has one) into the shape the credit-note PDF template expects —
 * mirrors buildInvoiceData's role for tax invoices.
 */
export function buildCreditNoteData(
  creditNote: CreditNoteRow,
  order: {
    orderNumber: string;
    email: string;
    phone: string;
    gstNumber: string | null;
    invoiceNumber: string | null;
    placedAt: Date | null;
    shippingAddress: unknown;
  },
  returnReason: string | null,
): CreditNoteData {
  const shipping = order.shippingAddress as {
    fullName: string;
    line1: string;
    line2?: string;
    city: string;
    state: string;
    pincode: string;
  };

  const fmt = (d: Date) =>
    d.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" });

  // Same function the original invoice was built with — re-derived here
  // rather than stored, since it's a pure function of data already on the
  // order, and reusing it (instead of reimplementing the diacritic-strip
  // logic) is what guarantees this can never drift from the invoice it's
  // reversing.
  const isInterState = isInterStateOrder(shipping.state);

  return {
    creditNoteNumber: creditNote.creditNoteNumber,
    creditNoteDate: fmt(creditNote.createdAt),
    originalInvoiceNumber: order.invoiceNumber ?? "—",
    originalInvoiceDate: order.placedAt ? fmt(order.placedAt) : "—",
    orderNumber: order.orderNumber,
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
    reason: returnReason ?? "Refund issued",
    isInterState,
    rateBreakdown: creditNote.rateBreakdown,
    taxableValue: creditNote.taxableValue,
    cgst: creditNote.cgst,
    sgst: creditNote.sgst,
    igst: creditNote.igst,
    refundedAmount: creditNote.refundedAmount,
    needsReview: creditNote.needsReview,
  };
}

/**
 * Convenience: fetch a credit note plus everything buildCreditNoteData needs
 * in one call, for a single-PDF download route.
 */
export async function getCreditNoteDataById(id: string): Promise<CreditNoteData | null> {
  const creditNote = await getCreditNoteById(id);
  if (!creditNote) return null;

  const [order] = await db
    .select({
      orderNumber: orders.orderNumber,
      email: orders.email,
      phone: orders.phone,
      gstNumber: orders.gstNumber,
      invoiceNumber: orders.invoiceNumber,
      placedAt: orders.placedAt,
      shippingAddress: orders.shippingAddress,
    })
    .from(orders)
    .where(eq(orders.id, creditNote.orderId))
    .limit(1);
  if (!order) return null;

  let returnReason: string | null = null;
  if (creditNote.returnId) {
    const [r] = await db
      .select({ reason: returns.reason })
      .from(returns)
      .where(eq(returns.id, creditNote.returnId))
      .limit(1);
    returnReason = r?.reason ?? null;
  }

  return buildCreditNoteData(creditNote, order, returnReason);
}
