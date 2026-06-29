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

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}
