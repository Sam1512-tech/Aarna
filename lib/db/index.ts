import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Deliberately always DATABASE_URL (the pooler), never DIRECT_URL, even
// during `next build`'s static-generation phase — confirmed live that
// Vercel's build machines (iad1) get ENETUNREACH connecting to Supabase's
// direct-connection address (it's IPv6-only; the build network has no route
// to it). DIRECT_URL only works from environments with IPv6 egress (a local
// dev machine), which is why the one-off scripts in scripts/ that use it are
// run manually, never as part of the Vercel build/runtime path.
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Add it to .env.local.");
}

// Server-side ceiling on how long any single query is allowed to run, sent
// as a Postgres startup parameter (postgres.js spreads `connection` into
// every new connection's startup message) — this is the textbook way to set
// statement_timeout with this library, and it IS honored end-to-end when
// connecting directly to Postgres (verified against DIRECT_URL: 5432).
//
// IMPORTANT — it is a no-op against the connection this app actually uses.
// DATABASE_URL points at Supabase's Supavisor pooler in *transaction* mode
// (port 6543), which multiplexes many logical client sessions over a shared
// set of backend connections and does not forward arbitrary per-client
// startup parameters to the backend — verified live: with this option set,
// `SHOW statement_timeout` over DATABASE_URL still reports the pooler's own
// fixed 2min default, completely ignoring the 20s requested here, while the
// identical option over DIRECT_URL correctly reports 20s. Left in place as a
// harmless safety net for any future direct/session-mode connection, but do
// not rely on it for the deployed configuration — see the real fix in
// getCategoriesSafe() (app/(storefront)/layout.tsx), which uses this same
// `client`'s per-query `.cancel()` (a real Postgres CancelRequest, verified
// to work through this pooler) instead of a session-level GUC.
const STATEMENT_TIMEOUT_MS = 20_000;

function createClient() {
  return postgres(connectionString!, {
    prepare: false,
    max: process.env.NODE_ENV === "production" ? 10 : 5,
    idle_timeout: 20,
    connect_timeout: 10,
    connection: {
      statement_timeout: STATEMENT_TIMEOUT_MS,
    },
  });
}

// In dev, Next.js hot-reload re-evaluates this module and would create a new
// pool on every recompile without closing the old one — orphaned connections
// pile up on Supabase's pooler until every query hangs. Cache the client on
// globalThis (survives HMR) so dev only ever holds one pool. Production
// module evaluation happens once per instance, so it just calls createClient.
const globalForDb = globalThis as unknown as {
  __aarnaPgClient?: ReturnType<typeof createClient>;
};

const client =
  process.env.NODE_ENV === "production"
    ? createClient()
    : (globalForDb.__aarnaPgClient ??= createClient());

export const db = drizzle(client, { schema });
export type Db = typeof db;
export { schema };

// The raw postgres.js client, exported only so call sites that need a real
// cancellable query handle (postgres.js's `.cancel()` — see
// getCategoriesSafe() in app/(storefront)/layout.tsx) can bypass Drizzle's
// QueryPromise, which awaits internally and never exposes one. Everything
// else should keep using `db` — this is the exact same connection pool
// Drizzle itself queries through under the hood (see
// drizzle-orm/postgres-js's session.js: `client.unsafe(query, params)`), not
// a second pool or a way around RLS/auth.
export { client as pgClient };
