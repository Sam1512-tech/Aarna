/**
 * Small helpers for recognizing specific Postgres error conditions thrown
 * through drizzle-orm's postgres-js driver.
 *
 * A plain module (not a "use server" action file) so it can be unit tested
 * and imported from anywhere — "use server" files can only export async
 * functions, so a synchronous predicate like this can't live there (see the
 * same reasoning behind lib/returns/reject-reasons.ts).
 */

/**
 * True if `err` is (or wraps) a Postgres foreign-key-violation error
 * (SQLSTATE 23503).
 *
 * Drizzle doesn't throw the raw `postgres.PostgresError` directly for a
 * failed query — it wraps it in a `DrizzleQueryError`, with the original
 * error preserved on `.cause` (confirmed live against the real dev DB:
 * `err.code` is `undefined`, `err.cause.code` is `"23503"`). Both shapes are
 * checked so this matches regardless of whether some future caller ends up
 * seeing the raw driver error or Drizzle's wrapper.
 */
export function isForeignKeyViolation(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  if (code === "23503") return true;
  const cause = (err as { cause?: unknown } | null)?.cause;
  return (cause as { code?: unknown } | null)?.code === "23503";
}
