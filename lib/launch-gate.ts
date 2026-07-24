/**
 * Pre-launch gate — Aarna's domain goes public before ordering opens
 * (deliberate 2-day gap: site live Mon Jul 27, ordering opens Wed Jul 29).
 * Everything storefront-facing rewrites to /coming-soon until then, unless
 * the request carries the preview-access cookie. /studio (admin) and /api
 * (webhooks + admin routes) are never gated — Arpitha/Sam need uninterrupted
 * access to keep entering products and running the backend all week.
 *
 * Runs in proxy.ts (edge middleware) — no DB access there (see the RBAC note
 * in lib/supabase/middleware.ts), so this is a pure env-var + cookie check,
 * nothing that needs a Drizzle query.
 */
export const PREVIEW_COOKIE = "aarna_preview";
const PREVIEW_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

// /studio being exempt is only real if everything ITS own auth redirect
// depends on is exempt too — unauthenticated /studio bounces through
// /login (see lib/supabase/middleware.ts), so /login must never be gated or
// admin login is silently locked out for the whole gate window. Deliberately
// NOT exempting /signup or /account — no reason for the public to create an
// account or browse order history before ordering opens.
const ALWAYS_EXEMPT_PREFIXES = [
  "/studio",
  "/api",
  "/coming-soon",
  "/login",
  "/auth",
  "/forgot-password",
  "/reset-password",
];
const ALWAYS_EXEMPT_EXACT = ["/robots.txt", "/sitemap.xml"];

export function ordersOpenAt(): Date | null {
  // Deliberately NOT NEXT_PUBLIC_ — that class of var gets inlined into the
  // build at compile time, so changing it wouldn't take effect without a
  // full rebuild. The coming-soon page (a server component) reads this and
  // passes the value down as a prop, so the client never needs to read the
  // env var directly — a plain server-only var stays readable at request
  // time, so Vercel env UI + redeploy is enough to move the date.
  const raw = process.env.ORDERING_OPENS_AT;
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Fail-open: if the launch date isn't configured, never gate — a missing
 *  env var must never accidentally lock out the live site. */
export function isGateActive(now: Date = new Date()): boolean {
  const opensAt = ordersOpenAt();
  if (!opensAt) return false;
  return now.getTime() < opensAt.getTime();
}

export function isExemptPath(pathname: string): boolean {
  if (ALWAYS_EXEMPT_EXACT.includes(pathname)) return true;
  return ALWAYS_EXEMPT_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function hasValidPreviewSecret(searchParamValue: string | null): boolean {
  const secret = process.env.PREVIEW_ACCESS_SECRET;
  if (!secret || !searchParamValue) return false;
  return searchParamValue === secret;
}

export function previewCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge: PREVIEW_COOKIE_MAX_AGE,
    path: "/",
  };
}
