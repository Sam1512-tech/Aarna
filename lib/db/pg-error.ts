/**
 * postgres.js (the driver behind Drizzle here, see lib/db/index.ts) throws a
 * PostgresError whose `.code` matches the raw Postgres error code and whose
 * `.constraint_name` names the violated constraint. This is used to recover
 * from a concurrent-insert race on a unique column (e.g. two admins creating
 * a product/variant at the same instant both compute the same generated
 * style code / SKU) instead of letting the raw DB error propagate uncaught.
 *
 * Drizzle doesn't let that PostgresError surface directly, though — every
 * query error gets wrapped in a `DrizzleQueryError`, with the original
 * PostgresError attached as `.cause` (confirmed live: `err.code` is
 * `undefined` on the wrapper itself, `err.cause.code` is `"23505"`). So this
 * checks both the error itself and one level of `.cause` before giving up.
 *
 * That matters here specifically because Next.js masks plain `Error`
 * messages thrown from server actions in production — an uncaught DB error
 * shows the admin a generic "something went wrong" instead of anything
 * actionable. Callers should catch around the insert, check this, and either
 * retry with a freshly-generated value or rethrow as an `ActionError` with a
 * friendly message.
 */
const UNIQUE_VIOLATION_CODE = "23505";

function matchesUniqueViolation(err: unknown, constraintName?: string): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { code?: unknown; constraint_name?: unknown };
  if (e.code !== UNIQUE_VIOLATION_CODE) return false;
  if (constraintName !== undefined && e.constraint_name !== constraintName) return false;
  return true;
}

export function isUniqueViolation(err: unknown, constraintName?: string): boolean {
  if (matchesUniqueViolation(err, constraintName)) return true;
  if (typeof err === "object" && err !== null && "cause" in err) {
    return matchesUniqueViolation((err as { cause?: unknown }).cause, constraintName);
  }
  return false;
}
