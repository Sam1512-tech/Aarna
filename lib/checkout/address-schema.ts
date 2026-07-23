import { z } from "zod";

/**
 * Server-side re-validation of the shipping address collected at checkout.
 * The storefront checkout form (components/storefront/checkout-view.tsx)
 * already enforces a much stricter version of this — letters-only names,
 * a real Indian mobile pattern, a postal-DB pincode lookup — but that's a
 * browser-side zod schema in a "use client" component, which can't be
 * imported into a server module (this codebase already hit that exact
 * server/client boundary break once, see lib/returns/reject-reasons.ts).
 *
 * This schema is deliberately looser than the client one: its only job is
 * to guarantee the fields downstream code actually depends on are present
 * and non-empty before they reach isInterStateOrder/calculateOrderGst
 * (lib/invoice/generate.ts), which throw on a missing `state` — never to
 * duplicate the client's typo-policing. An unvalidated/malformed address
 * (a hand-crafted request, or a legacy row from before the client
 * validation existed) previously reached buildInvoiceData unchecked and
 * crashed invoice generation on the payment.captured webhook and on admin
 * invoice reprint/batch-print.
 */
export const shippingAddressSchema = z.object({
  fullName: z.string().trim().min(1, "Full name is required").max(100),
  phone: z.string().trim().min(1, "Phone number is required").max(20),
  line1: z.string().trim().min(1, "Address line 1 is required").max(200),
  line2: z.string().trim().max(200).optional(),
  city: z.string().trim().min(1, "City is required").max(100),
  state: z.string().trim().min(1, "State is required").max(60),
  pincode: z.string().trim().regex(/^\d{6}$/, "A 6-digit PIN code is required"),
});
