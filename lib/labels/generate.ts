import { renderToBuffer } from "@react-pdf/renderer";
import React from "react";
import { HangTagDocument, type HangTagData } from "./template";
import { ActionError } from "@/lib/action-error";

export type { HangTagData } from "./template";

/**
 * Renders one or more hang-tag labels (50×30mm each) into a single PDF buffer.
 * Each tag becomes one page in the PDF, ready to print on label rolls on any
 * thermal/laser label printer with the right roll size.
 */
export async function generateHangTagPdf(tags: HangTagData[]): Promise<Buffer> {
  if (tags.length === 0) throw new ActionError("At least one tag is required");
  // renderToBuffer expects a Document at root — our wrapper produces one.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const element = React.createElement(HangTagDocument, { tags }) as any;
  const buffer = await renderToBuffer(element);
  return Buffer.from(buffer);
}
