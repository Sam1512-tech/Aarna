import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

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
