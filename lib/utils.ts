import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a paise value as INR with the Indian number system (lakhs/crores).
 * Input is always paise — same convention as the rest of the codebase.
 *   formatINR(249900) → "₹2,499"
 *   formatINR(249950) → "₹2,499.50"
 */
export function formatINR(paise: number): string {
  const rupees = paise / 100;
  const hasDecimals = paise % 100 !== 0;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(rupees);
}

/**
 * Convert a title into a URL-safe slug. The single canonical implementation —
 * used across every admin create/edit form (products, categories,
 * collections). Re-exported from components/admin/admin-form.tsx for
 * backwards-compatible imports; don't reintroduce a second implementation.
 *   slugify("Boho_Dress") → "boho-dress"
 */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
