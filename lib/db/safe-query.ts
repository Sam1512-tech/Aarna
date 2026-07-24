/**
 * Races a database read against a timeout so a hung Supabase pooler connection
 * can never stall the caller past `timeoutMs`. Returns `fallback` on EITHER a
 * timeout or a rejection.
 *
 * Why this exists: DATABASE_URL points at Supabase's transaction-mode pooler,
 * which intermittently hangs a query with no response at all (see the pooler
 * notes in lib/db/index.ts). During `next build`, Next trial-renders every
 * page during "Generating static pages" — a single hung query there blows past
 * Next's 60s per-page budget and fails the ENTIRE deployment. This has taken
 * down real production deploys repeatedly. Turning that hang into a fast,
 * graceful empty-state render is strictly better: a degraded page that
 * self-heals on the next ISR revalidate beats a failed deploy every time.
 *
 * IMPORTANT — this does NOT, on its own, cancel the underlying query. A Drizzle
 * QueryPromise exposes no cancellable handle, so the abandoned query keeps
 * running server-side until it settles, still holding one of the ~10 pooled
 * connections. That is an accepted trade-off: the acute failure guarded against
 * is the *build hang*, and the build process is ephemeral. A call site that
 * also needs to free the pooled connection under sustained *runtime* distress
 * can pass `onTimeout` to fire a real `.cancel()` on a raw pgClient query — see
 * getCategoriesSafe() in app/(storefront)/layout.tsx, the one hot path where
 * connection-pool exhaustion under live traffic is a real concern.
 *
 * This is the key difference from the old inline pattern it replaces: that one
 * did `await query` and relied on `.cancel()` succeeding to break the wait, so
 * when the pooler was distressed enough that `.cancel()`'s own auxiliary
 * connection also failed, nothing ever settled the query and the wait hung for
 * the full page-render budget anyway. Here the timeout wins the race
 * unconditionally, whether or not any cancel can get through.
 */

/** Standard timeout for a build/ISR-time read that must degrade rather than hang. */
export const SAFE_DB_READ_TIMEOUT_MS = 8000;

export interface SafeDbReadOptions<T> {
  timeoutMs: number;
  fallback: T;
  /** Short identifier for the log line when the fallback is used. */
  label: string;
  /**
   * Best-effort cleanup fired the moment the timeout wins — e.g. `.cancel()`
   * on a raw pgClient query to free the pooled connection. NOT load-bearing:
   * the fallback is returned whether or not this does anything. Any throw here
   * is swallowed.
   */
  onTimeout?: () => void;
}

export async function safeDbRead<T>(
  promise: Promise<T>,
  { timeoutMs, fallback, label, onTimeout }: SafeDbReadOptions<T>,
): Promise<T> {
  // A rejection that lands AFTER the timeout has already won the race would
  // otherwise be an unhandledRejection — nothing is awaiting `promise` anymore.
  // Attaching a no-op catch here marks it handled without affecting the race.
  promise.catch(() => {});

  const TIMED_OUT = Symbol("timed-out");
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => {
      try {
        onTimeout?.();
      } catch {
        /* cleanup is best-effort */
      }
      resolve(TIMED_OUT);
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeout]);
    if (result === TIMED_OUT) {
      console.error(
        `[safeDbRead] ${label} timed out after ${timeoutMs}ms — using fallback`,
      );
      return fallback;
    }
    return result;
  } catch (err) {
    console.error(`[safeDbRead] ${label} failed — using fallback:`, err);
    return fallback;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
