// Shared, framework-agnostic COD constants — importable from both server
// code (lib/actions/checkout.ts) and client components (checkout-view.tsx's
// live order-summary preview), mirroring how lib/checkout/address-schema.ts
// already sits alongside checkout.ts for the same reason.

/** Flat convenience fee for choosing Cash on Delivery, in paise. */
export const COD_CONVENIENCE_FEE_PAISE = 4900; // Rs.49
