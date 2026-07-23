/**
 * Extracts the Postgres SQLSTATE error code (e.g. "23505" unique-violation,
 * "23503" foreign-key-violation) from an error thrown by a Drizzle query.
 *
 * Drizzle wraps the real driver error in its own DrizzleQueryError — the
 * actual `postgres` package PostgresError (which carries `.code`) lives at
 * `.cause`, not directly on the caught error. Checking `err.code` directly
 * never matches anything real and silently never catches anything; this
 * was confirmed live against the real dev DB while fixing exactly that bug
 * in lib/actions/account.ts's requestReturn(). Falls back to checking the
 * top level too, defensively, in case some Drizzle call path doesn't wrap
 * the error the same way.
 */
export function postgresErrorCode(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  const direct = (err as { code?: unknown }).code;
  if (typeof direct === "string") return direct;
  const cause = (err as { cause?: unknown }).cause;
  if (typeof cause === "object" && cause !== null) {
    const causeCode = (cause as { code?: unknown }).code;
    if (typeof causeCode === "string") return causeCode;
  }
  return undefined;
}
