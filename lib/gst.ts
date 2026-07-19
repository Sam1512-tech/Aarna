/**
 * GST (Goods & Services Tax) constants and helpers shared between checkout
 * (client + server validation) and invoice generation.
 *
 * Rate slab for garments (HSN 6211), per current GST Council rate schedule:
 * a piece priced at or below Rs.2500 is taxed at 5%; above that, 18%. The
 * threshold applies per garment (per unit price), not per order or per line
 * quantity — buying three Rs.2000 pieces still taxes each one at 5%.
 */

export const GST_VALUE_THRESHOLD_PAISE = 250000; // Rs.2500
export const GST_LOW_RATE_PERCENT = 5;
export const GST_HIGH_RATE_PERCENT = 18;

export function gstRatePercentFor(unitPricePaise: number): number {
  return unitPricePaise <= GST_VALUE_THRESHOLD_PAISE
    ? GST_LOW_RATE_PERCENT
    : GST_HIGH_RATE_PERCENT;
}

// Standard 15-character GSTIN: 2-digit state code, 10-char PAN, 1-digit
// entity number, literal "Z", 1 alphanumeric checksum.
export const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/**
 * Validates and normalizes a customer-entered GSTIN. Returns null for a
 * blank/absent input (GST number is optional — only relevant to business
 * buyers who want it on the tax invoice), throws-shaped callers should treat
 * a defined-but-invalid string as an error, not silently drop it.
 */
export function normalizeGstin(input: string | null | undefined): string | null {
  const trimmed = (input ?? "").trim().toUpperCase();
  return trimmed || null;
}

export function isValidGstin(gstin: string): boolean {
  return GSTIN_PATTERN.test(gstin);
}
