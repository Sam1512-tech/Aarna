import { renderToBuffer } from "@react-pdf/renderer";
import React from "react";
import { InvoiceDocument, type InvoiceData } from "./template";

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
 * Determines whether an order is inter-state based on the customer's state.
 * Karnataka orders are intra-state (CGST+SGST), all others are inter-state (IGST).
 */
export function isInterStateOrder(customerState: string): boolean {
  return customerState.trim().toLowerCase() !== "karnataka";
}

/**
 * Calculates GST breakdown for a given taxable amount (in paise).
 * GST rate for garments (HSN 6211): 12%
 * Prices stored in DB are GST-inclusive, so we back-calculate.
 */
export function calculateGst(inclusiveAmountPaise: number, interState: boolean) {
  // inclusive amount = taxable + 12% GST
  // taxable = inclusive / 1.12
  const taxable = Math.round(inclusiveAmountPaise / 1.12);
  const totalGst = inclusiveAmountPaise - taxable;
  return {
    taxableAmount: taxable,
    cgst: interState ? 0 : Math.round(totalGst / 2),
    sgst: interState ? 0 : Math.round(totalGst / 2),
    igst: interState ? totalGst : 0,
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
