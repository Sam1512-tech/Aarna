import { renderToBuffer } from "@react-pdf/renderer";
import React from "react";
import { gstRatePercentFor } from "@/lib/gst";
import { InvoiceBatchDocument, InvoiceDocument, type InvoiceData } from "./template";

export type { InvoiceData, InvoiceLineItem } from "./template";

/**
 * Returns the current Indian financial year string, e.g. "26-27".
 * Financial year runs April–March.
 */
export function currentFinancialYear(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1-based
  const startYear = month >= 4 ? year : year - 1;
  return `${String(startYear).slice(2)}-${String(startYear + 1).slice(2)}`;
}

/**
 * Formats a sequential invoice number.
 * e.g. formatInvoiceNumber("26-27", 42) → "AL/26-27/00042"
 */
export function formatInvoiceNumber(financialYear: string, sequence: number): string {
  return `AL/${financialYear}/${String(sequence).padStart(5, "0")}`;
}

/**
 * Derives the Postgres sequence name for a given financial year, e.g.
 * "26-27" -> "invoice_seq_26_27". Used by markOrderPaid
 * (lib/db/queries/orders.ts) to scope the invoice-number sequence per FY —
 * one global sequence would never reset, so the first invoice of a new FY
 * would silently continue the previous year's count instead of restarting
 * at 00001, misrepresenting invoice counts on every tax document.
 *
 * The result gets spliced into raw SQL by the caller (CREATE SEQUENCE
 * doesn't accept its name as a bound parameter), so it's validated against
 * a strict pattern first — `currentFinancialYear()`'s output is fully
 * internally computed, not user input, but this refuses to ever pass an
 * unexpected value through unescaped rather than assuming that always holds.
 */
export function invoiceSequenceName(financialYear: string): string {
  const name = `invoice_seq_${financialYear.replace("-", "_")}`;
  if (!/^invoice_seq_\d{2}_\d{2}$/.test(name)) {
    throw new Error(
      `Unexpected invoice sequence name derived from financial year "${financialYear}": ${name}`,
    );
  }
  return name;
}

/**
 * Formats a sequential credit note number, mirroring formatInvoiceNumber's
 * "AL/26-27/00042" shape with a "CN" prefix instead — e.g.
 * formatCreditNoteNumber("26-27", 7) → "CN/26-27/00007". Kept as its own
 * sequence (creditNoteSequenceName below), not sharing the invoice sequence
 * — a credit note is a distinct GST document type from a tax invoice and
 * needs its own traceable numbering for GSTR-1's credit/debit-note table.
 */
export function formatCreditNoteNumber(financialYear: string, sequence: number): string {
  return `CN/${financialYear}/${String(sequence).padStart(5, "0")}`;
}

/**
 * Derives the Postgres sequence name for a credit note number, e.g.
 * "26-27" -> "credit_note_seq_26_27". Same reasoning and same validation
 * discipline as invoiceSequenceName above.
 */
export function creditNoteSequenceName(financialYear: string): string {
  const name = `credit_note_seq_${financialYear.replace("-", "_")}`;
  if (!/^credit_note_seq_\d{2}_\d{2}$/.test(name)) {
    throw new Error(
      `Unexpected credit note sequence name derived from financial year "${financialYear}": ${name}`,
    );
  }
  return name;
}

/**
 * Determines whether an order is inter-state based on the customer's state.
 * Karnataka orders are intra-state (CGST+SGST), all others are inter-state (IGST).
 *
 * Strips diacritics before comparing — a real order was found with the
 * state stored as "Karnātaka" (probably an address-autofill artifact), and
 * a plain lowercase compare silently treated it as inter-state, charging
 * IGST instead of CGST+SGST on that customer's invoice.
 */
export function isInterStateOrder(customerState: string): boolean {
  const normalized = customerState
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return normalized !== "karnataka";
}

export interface GstLineInput {
  unitPrice: number; // paise, GST-inclusive, pre-discount
  quantity: number;
  lineTotal: number; // paise, GST-inclusive, pre-discount (unitPrice * quantity)
}

export interface GstLineResult extends GstLineInput {
  gstRatePercent: number;
  discountedLineTotal: number; // GST-inclusive, after proportional discount allocation
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
}

export interface GstRateBreakdown {
  ratePercent: number;
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
}

export interface OrderGstResult {
  lines: GstLineResult[];
  // One entry per distinct rate actually present, ascending — an order can
  // mix Rs.2500-and-under pieces (5%) with pricier ones (18%), and GST rules
  // require those shown as separate taxable/tax lines, never blended.
  rateBreakdown: GstRateBreakdown[];
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
}

/**
 * Computes GST for an order, per line item, using the garment value-slab
 * rule (HSN 6211): a piece priced at or below Rs.2500 is taxed at 5%, above
 * that at 18% — see lib/gst.ts. The threshold is evaluated on each line's
 * *original* unit price, not a discount-adjusted one, so a coupon can never
 * shift which slab a piece falls into.
 *
 * An order-level discount is allocated across lines proportionally to each
 * line's share of the pre-discount subtotal; the last line absorbs whatever
 * rounding remainder is left so the discounted lines always sum back to
 * exactly (subtotal - discount). Prices are GST-inclusive, so tax is
 * back-calculated from each line's discounted total at its own rate.
 */
export function calculateOrderGst(
  items: GstLineInput[],
  discountPaise: number,
  interState: boolean,
): OrderGstResult {
  const subtotal = items.reduce((sum, i) => sum + i.lineTotal, 0);

  let allocatedDiscount = 0;
  const lines: GstLineResult[] = items.map((item, index) => {
    const isLast = index === items.length - 1;
    const share = isLast
      ? discountPaise - allocatedDiscount
      : subtotal > 0
        ? Math.round((item.lineTotal / subtotal) * discountPaise)
        : 0;
    allocatedDiscount += share;

    const discountedLineTotal = Math.max(0, item.lineTotal - share);
    const gstRatePercent = gstRatePercentFor(item.unitPrice);
    const taxableAmount = Math.round(
      discountedLineTotal / (1 + gstRatePercent / 100),
    );
    const totalTax = discountedLineTotal - taxableAmount;
    const cgst = interState ? 0 : Math.round(totalTax / 2);

    return {
      ...item,
      gstRatePercent,
      discountedLineTotal,
      taxableAmount,
      cgst,
      // totalTax - cgst rather than a second independent round(), so
      // cgst + sgst always equals totalTax exactly even when it's odd.
      sgst: interState ? 0 : totalTax - cgst,
      igst: interState ? totalTax : 0,
    };
  });

  const byRate = new Map<number, GstRateBreakdown>();
  for (const line of lines) {
    const bucket = byRate.get(line.gstRatePercent) ?? {
      ratePercent: line.gstRatePercent,
      taxableAmount: 0,
      cgst: 0,
      sgst: 0,
      igst: 0,
    };
    bucket.taxableAmount += line.taxableAmount;
    bucket.cgst += line.cgst;
    bucket.sgst += line.sgst;
    bucket.igst += line.igst;
    byRate.set(line.gstRatePercent, bucket);
  }

  return {
    lines,
    rateBreakdown: [...byRate.values()].sort(
      (a, b) => a.ratePercent - b.ratePercent,
    ),
    taxableAmount: lines.reduce((s, l) => s + l.taxableAmount, 0),
    cgst: lines.reduce((s, l) => s + l.cgst, 0),
    sgst: lines.reduce((s, l) => s + l.sgst, 0),
    igst: lines.reduce((s, l) => s + l.igst, 0),
  };
}

/**
 * Renders the invoice to a PDF Buffer ready to attach to an email.
 */
export async function generateInvoicePdf(data: InvoiceData): Promise<Buffer> {
  // renderToBuffer expects a Document element at root; our wrapper renders one.
  // Cast is safe — the runtime tree is correct.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const element = React.createElement(InvoiceDocument, { data }) as any;
  const buffer = await renderToBuffer(element);
  return Buffer.from(buffer);
}

/**
 * Renders multiple invoices into a single PDF (one page per invoice) — for
 * the admin "print selected invoices" flow, so printing 20 orders' invoices
 * is one file instead of 20 separate downloads.
 */
export async function generateInvoicePdfBatch(dataList: InvoiceData[]): Promise<Buffer> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const element = React.createElement(InvoiceBatchDocument, { invoices: dataList }) as any;
  const buffer = await renderToBuffer(element);
  return Buffer.from(buffer);
}
