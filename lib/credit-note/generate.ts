import { renderToBuffer } from "@react-pdf/renderer";
import React from "react";
import { CreditNoteBatchDocument, CreditNoteDocument, type CreditNoteData } from "./template";

export type { CreditNoteData } from "./template";

/**
 * Renders a credit note to a PDF Buffer, same pattern as
 * lib/invoice/generate.ts's generateInvoicePdf.
 */
export async function generateCreditNotePdf(data: CreditNoteData): Promise<Buffer> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const element = React.createElement(CreditNoteDocument, { data }) as any;
  const buffer = await renderToBuffer(element);
  return Buffer.from(buffer);
}

/**
 * Renders multiple credit notes into a single PDF (one page per credit
 * note) — same pattern as generateInvoicePdfBatch.
 */
export async function generateCreditNotePdfBatch(dataList: CreditNoteData[]): Promise<Buffer> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const element = React.createElement(CreditNoteBatchDocument, { credits: dataList }) as any;
  const buffer = await renderToBuffer(element);
  return Buffer.from(buffer);
}
