// Shared, framework-agnostic COD constants — importable from both server
// code (lib/actions/checkout.ts) and client components (checkout-view.tsx's
// live order-summary preview), mirroring how lib/checkout/address-schema.ts
// already sits alongside checkout.ts for the same reason.

/** Flat convenience fee for choosing Cash on Delivery, in paise. */
export const COD_CONVENIENCE_FEE_PAISE = 4900; // Rs.49

/**
 * Whether Cash on Delivery is available right now — both the client-side
 * "should I show the option" question and, more importantly, the
 * server-side gate initCheckout re-checks independently before ever
 * accepting a COD order (never trust the client's own read of this).
 *
 * Reads COD_ENABLED_AT, an ISO datetime string. Available once that instant
 * has passed; unavailable if it's unset, unparseable, or still in the
 * future. Deliberately fails CLOSED (unlike the old, now-removed
 * lib/launch-gate.ts, which failed OPEN because accidentally locking out
 * the whole live site was the worse failure mode there) — for a payment
 * method, accidentally leaving it silently unavailable is far cheaper than
 * accidentally leaving it silently available with no real activation date
 * configured.
 *
 * Doubles as the ongoing kill switch, not just the one-time launch gate:
 * pushing COD_ENABLED_AT into the future (or unsetting it) turns COD off
 * again with an env var change + redeploy, no code change needed — the
 * same single mechanism serves both "not yet" and "not right now".
 */
export function isCodEnabled(): boolean {
  const raw = process.env.COD_ENABLED_AT;
  if (!raw) return false;
  const at = new Date(raw);
  if (Number.isNaN(at.getTime())) return false;
  return Date.now() >= at.getTime();
}
