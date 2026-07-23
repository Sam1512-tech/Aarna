/**
 * A brand-new customer's very first address must become their default —
 * there's no other default to fall back to — regardless of what the caller
 * passed for `isDefault`.
 *
 * The old inline logic, `input.isDefault ?? existing.length === 0`, looked
 * right but `??` only falls back on null/undefined, never on explicit
 * `false` — and the storefront address form always initializes a new
 * address's `isDefault` state to `false` (never omits it), so the
 * "first address" branch was actually unreachable in practice. Checking
 * `existingCount === 0` first, unconditionally, closes that gap and can't
 * be defeated by a future form regression sending `false` again.
 */
export function computeIsDefaultForNewAddress(
  existingCount: number,
  requestedIsDefault: boolean | undefined,
): boolean {
  if (existingCount === 0) return true;
  return requestedIsDefault ?? false;
}
