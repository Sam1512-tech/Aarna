import bwipjs from "bwip-js";
import { ActionError } from "@/lib/action-error";

/**
 * Generates a Code 128 barcode PNG buffer from a string (typically an SKU).
 *
 * Code 128 is the right choice for internal/D2C use:
 * - Free, no registration with GS1
 * - Encodes alphanumeric — supports our SKU format directly
 * - Universal scanner support
 * - Compact at small label sizes
 *
 * Returns a PNG Buffer that can be embedded directly in @react-pdf/renderer
 * via <Image src={buffer} />.
 */
export async function generateCode128Png(value: string): Promise<Buffer> {
  if (!value?.trim()) throw new ActionError("Barcode value is required");

  return bwipjs.toBuffer({
    bcid: "code128",
    text: value.trim(),
    scale: 3, // pixel density
    height: 8, // bar height in mm
    includetext: false, // SKU text is rendered by the PDF template
    backgroundcolor: "FFFFFF",
    paddingwidth: 0,
    paddingheight: 0,
  });
}
