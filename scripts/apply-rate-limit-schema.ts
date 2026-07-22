/**
 * Additive schema migration for Postgres-backed rate limiting
 * (lib/security/rate-limit.ts).
 *
 * Not run via `drizzle-kit push` — see the "db:push is not safe to run
 * blindly" gotcha in CLAUDE.md. This is a brand-new table (nothing existing
 * is touched), so it's low-risk, but kept as a one-off script for
 * consistency with every other schema change in this project.
 *
 * Adds:
 *   - rate_limit_attempts table (fixed-window counters keyed by rateKey +
 *     windowStart) + its unique index
 *   - RLS enabled (default-deny — only the Drizzle owner role touches this
 *     table, same as everywhere else in lib/db/rls.sql)
 *
 * Usage: npx tsx scripts/apply-rate-limit-schema.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import postgres from "postgres";

async function connect(): Promise<ReturnType<typeof postgres>> {
  const direct = process.env.DIRECT_URL;
  if (direct) {
    const sql = postgres(direct, { prepare: false, connect_timeout: 8 });
    try {
      await sql`select 1`;
      console.log("🔌 Connected via DIRECT_URL.");
      return sql;
    } catch (err) {
      console.warn(
        `⚠️  DIRECT_URL unreachable (${(err as Error).message}) — falling back to DATABASE_URL (pooler).`,
      );
      await sql.end({ timeout: 1 }).catch(() => {});
    }
  }
  const pooled = process.env.DATABASE_URL;
  if (!pooled) {
    console.error("❌ Neither DIRECT_URL nor DATABASE_URL is reachable/set.");
    process.exit(1);
  }
  const sql = postgres(pooled!, { prepare: false, connect_timeout: 8 });
  console.log("🔌 Connected via DATABASE_URL (pooler).");
  return sql;
}

async function main() {
  const sql = await connect();

  console.log("Creating rate_limit_attempts table...");
  await sql`
    CREATE TABLE IF NOT EXISTS rate_limit_attempts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      rate_key varchar(200) NOT NULL,
      window_start timestamptz NOT NULL,
      count integer NOT NULL DEFAULT 1,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS rate_limit_key_window_idx
    ON rate_limit_attempts (rate_key, window_start)
  `;

  console.log("Enabling RLS (default-deny)...");
  await sql`ALTER TABLE public.rate_limit_attempts ENABLE ROW LEVEL SECURITY`;

  const check = await sql<{ rowsecurity: boolean }[]>`
    SELECT rowsecurity FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'rate_limit_attempts'`;
  console.log(`✅ rate_limit_attempts exists, RLS enabled: ${check[0]?.rowsecurity}`);

  await sql.end();
}

main().catch((err) => {
  console.error("❌ apply-rate-limit-schema failed:", err);
  process.exit(1);
});
