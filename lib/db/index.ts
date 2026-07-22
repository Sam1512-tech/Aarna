import { drizzle } from "drizzle-orm/postgres-js";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import postgres from "postgres";
import * as schema from "./schema";

// `next build`'s static-generation workers set this env var (see
// node_modules/next/dist/build/index.js). Static generation runs once on a
// single build machine, so it's safe to use the direct connection there even
// though runtime request handling stays on the pooler (which exists for
// connection-limit reasons that only matter at request scale, not one-shot
// build time). The pooler has a documented habit of intermittently
// hanging/cancelling queries — previously that only cost a single slow/failed
// page load, but now that more pages attempt static generation (see the
// storefront-layout cart-badge fix), the same flakiness can hang past Next's
// 60s static-generation timeout and fail the whole deployment instead.
const isBuildPhase = process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD;
const connectionString =
  (isBuildPhase && process.env.DIRECT_URL) || process.env.DATABASE_URL;

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
