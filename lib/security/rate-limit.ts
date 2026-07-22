import { lt, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { db, schema } from "@/lib/db";

const { rateLimitAttempts } = schema;

export interface RateLimitOptions {
  maxAttempts: number;
  windowSeconds: number;
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
  loginByEmail: { maxAttempts: 10, windowSeconds: 15 * 60 },
  loginByIp: { maxAttempts: 20, windowSeconds: 15 * 60 },
  otpByEmail: { maxAttempts: 5, windowSeconds: 15 * 60 },
  otpByIp: { maxAttempts: 10, windowSeconds: 15 * 60 },
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
