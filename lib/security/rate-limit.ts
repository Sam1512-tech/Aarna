import { lt, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { after } from "next/server";
import { db, schema } from "@/lib/db";
import { alertAdminSuspiciousActivity } from "@/lib/security/alert-admin";

const { rateLimitAttempts } = schema;

export interface RateLimitOptions {
  maxAttempts: number;
  windowSeconds: number;
  // Human-readable label for the admin alert email fired the moment this
  // limit is actually breached (see checkRateLimit). Omit to rate-limit
  // silently with no alert — used for the lower-stakes limits below.
  alertLabel?: string;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
}

// Named presets so every call site agrees on the same numbers instead of
// picking its own — tune here, not at each call site.
export const RATE_LIMITS = {
  // Two limits stack on login/OTP: by-email (stops someone hammering one
  // victim's account) and by-IP (stops one attacker spraying many emails).
  loginByEmail: { maxAttempts: 10, windowSeconds: 15 * 60, alertLabel: "Repeated failed logins for one account" },
  loginByIp: { maxAttempts: 20, windowSeconds: 15 * 60, alertLabel: "Repeated login attempts from one connection" },
  otpByEmail: { maxAttempts: 5, windowSeconds: 15 * 60, alertLabel: "Repeated OTP requests for one email" },
  otpByIp: { maxAttempts: 10, windowSeconds: 15 * 60, alertLabel: "Repeated OTP requests from one connection" },
  // Separate from otpByEmail/otpByIp above: those throttle *requesting* a
  // new code, this throttles *guessing* the code once one's outstanding —
  // without this, an attacker who knows a target's email could brute-force
  // the 6-digit space against a single still-valid code with no limit at
  // all, since sendEmailOtp's own limit only bounds how often a fresh code
  // can be requested.
  otpVerifyByEmail: { maxAttempts: 10, windowSeconds: 15 * 60, alertLabel: "Repeated OTP verification failures for one account" },
  otpVerifyByIp: { maxAttempts: 20, windowSeconds: 15 * 60, alertLabel: "Repeated OTP verification attempts from one connection" },
  signupByIp: { maxAttempts: 5, windowSeconds: 60 * 60 },
  couponApplyByIp: { maxAttempts: 20, windowSeconds: 10 * 60 },
} as const satisfies Record<string, RateLimitOptions>;

/**
 * Fixed-window rate limiter backed by Postgres (see schema comment on
 * rateLimitAttempts for why not an in-memory counter). Checking a key
 * increments its current window's row; the window is `windowSeconds` wide,
 * starting at the epoch (so every caller's window boundaries line up).
 *
 * Fixed windows can technically allow up to ~2x the limit right at a window
 * boundary (e.g. maxAttempts at 14:59:59 + maxAttempts at 15:00:00) — an
 * accepted tradeoff for the simplicity of not needing a sliding-window log
 * table. This is a deterrent against sustained brute-force, not a hard
 * mathematical cap.
 *
 * Fails OPEN on any DB error (logged, not thrown) — a rate-limit check
 * hiccuping should never itself lock out a legitimate customer. This is
 * different from e.g. webhook signature verification, which must fail
 * closed: this is a mitigation layer, not the actual security boundary.
 *
 * When `opts.alertLabel` is set, crossing the limit emails every admin —
 * exactly once per (key, window), at the precise request that pushes the
 * count from allowed to over-limit (count === maxAttempts + 1), not on
 * every subsequent blocked request in the same window. Otherwise a
 * sustained attacker retrying against an already-tripped limit would
 * flood the admin's inbox with one email per request. The send itself is
 * scheduled via Next's `after()` rather than awaited or fired-and-forgotten,
 * so it can't get cut off by the serverless instance freezing right after
 * the response goes out, without adding the email's latency to every
 * caller's response time. Every call site is a server action invoked from
 * within a real request (login/signup/OTP forms, coupon apply), which is a
 * valid `after()` context.
 */
export async function checkRateLimit(
  key: string,
  opts: RateLimitOptions,
): Promise<RateLimitResult> {
  try {
    const windowMs = opts.windowSeconds * 1000;
    const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);

    const [row] = await db
      .insert(rateLimitAttempts)
      .values({ rateKey: key, windowStart, count: 1 })
      .onConflictDoUpdate({
        target: [rateLimitAttempts.rateKey, rateLimitAttempts.windowStart],
        set: { count: sql`${rateLimitAttempts.count} + 1` },
      })
      .returning({ count: rateLimitAttempts.count });

    const count = row?.count ?? 1;

    if (opts.alertLabel && count === opts.maxAttempts + 1) {
      // Scheduled via `after()` rather than fired-and-forgotten: on Vercel's
      // serverless runtime, the function instance is free to freeze the
      // moment the response is sent, and a bare `.catch()` with no `await`
      // has no guarantee the in-flight Resend call survives that — it can
      // be silently dropped mid-request with nothing logged, since the
      // process was frozen, not errored. `after()` keeps the response fast
      // (the alert doesn't block it) while guaranteeing Next keeps the
      // instance alive until this callback actually settles.
      after(() =>
        alertAdminSuspiciousActivity({
          event: opts.alertLabel!,
          detail: `Rate limit exceeded for "${key}" — ${count} attempts within ${Math.round(opts.windowSeconds / 60)} minute(s) (limit: ${opts.maxAttempts}).`,
        }).catch((err) => console.error("[rate-limit] alert failed:", err)),
      );
    }

    return {
      allowed: count <= opts.maxAttempts,
      remaining: Math.max(0, opts.maxAttempts - count),
    };
  } catch (err) {
    console.error(`[rate-limit] check failed for key "${key}", failing open:`, err);
    return { allowed: true, remaining: opts.maxAttempts };
  }
}

/**
 * Best-effort client IP from Vercel's forwarding headers. Returns "unknown"
 * outside of a real request context (e.g. local scripts) — callers should
 * treat that as its own bucket, not skip limiting entirely.
 */
export async function getClientIp(): Promise<string> {
  const h = await headers();
  const forwardedFor = h.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return h.get("x-real-ip") ?? "unknown";
}

/**
 * Deletes rate-limit rows old enough that no in-flight window could still
 * reference them. Called from the daily cron (app/api/cron/cleanup-orders)
 * — every window here is at most an hour wide (see RATE_LIMITS), so a day
 * of slack is generous, not tight.
 */
export async function cleanupOldRateLimitAttempts(olderThanHours = 24): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
  const deleted = await db
    .delete(schema.rateLimitAttempts)
    .where(lt(schema.rateLimitAttempts.windowStart, cutoff))
    .returning({ id: schema.rateLimitAttempts.id });
  return deleted.length;
}
