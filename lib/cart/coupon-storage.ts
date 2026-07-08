// Carries an applied coupon code from the cart page to checkout. The cart
// and checkout pages are separate client components with no shared state —
// without this, a coupon applied on /cart silently vanished at /checkout and
// the customer was charged full price.
const COUPON_STORAGE_KEY = "aarna-cart-coupon";

export function getStoredCoupon(): string | null {
  try {
    return window.localStorage.getItem(COUPON_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredCoupon(code: string): void {
  try {
    window.localStorage.setItem(COUPON_STORAGE_KEY, code);
  } catch {
    // private mode or quota — coupon just won't carry over, non-fatal
  }
}

export function clearStoredCoupon(): void {
  try {
    window.localStorage.removeItem(COUPON_STORAGE_KEY);
  } catch {
    // ignore
  }
}
