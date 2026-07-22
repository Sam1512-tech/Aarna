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

function createClient() {
  return postgres(connectionString!, {
    prepare: false,
    max: process.env.NODE_ENV === "production" ? 10 : 5,
    idle_timeout: 20,
    connect_timeout: 10,
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
