/**
 * Additive schema migration for per-category size charts.
 *
 * Not run via `drizzle-kit push` — see the "db:push is not safe to run
 * blindly" gotcha in CLAUDE.md. This script only ever adds a column —
 * nothing here is destructive, and it's safe to re-run.
 *
 * Adds:
 *   - categories.size_chart (jsonb, NULLABLE, no default) — null means "use the
 *     built-in default size guide", so every existing category (Dresses, Tops,
 *     Sets) behaves exactly as before. A nullable column with no default is a
 *     metadata-only change in Postgres: no table rewrite.
 *
 * Run this BEFORE the code that reads the column is deployed: the old code
 * ignores the extra column, but the new code selects it and would fail on
 * every page that reads categories if it didn't exist yet.
 *
 * Usage: npx tsx scripts/apply-category-size-chart-column.ts
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
  const sql = postgres(pooled, { prepare: false, connect_timeout: 8 });
  await sql`select 1`;
  console.log("🔌 Connected via DATABASE_URL (pooler).");
  return sql;
}

async function main() {
  const sql = await connect();

  console.log("📐 Adding categories.size_chart...");
  // ALTER TABLE needs a brief exclusive lock. On the live database, if some
  // long-running query already holds a lock on `categories`, a plain ALTER
  // would WAIT — and every storefront read of `categories` queues up behind
  // the waiting ALTER. So: give up after 3s (SET LOCAL lock_timeout, inside a
  // transaction so it's the same connection as the ALTER) and retry, instead
  // of ever blocking live traffic.
  const MAX_ATTEMPTS = 6;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      await sql.begin(async (tx) => {
        await tx.unsafe(`SET LOCAL lock_timeout = '3s'`);
        await tx.unsafe(
          `ALTER TABLE categories ADD COLUMN IF NOT EXISTS size_chart jsonb`,
        );
      });
      break;
    } catch (err) {
      const lockBusy = (err as { code?: string }).code === "55P03";
      if (!lockBusy || attempt === MAX_ATTEMPTS) throw err;
      console.warn(
        `⏳ categories was busy (attempt ${attempt}/${MAX_ATTEMPTS}) — nothing changed, retrying in 3s.`,
      );
      await new Promise((r) => setTimeout(r, 3000));
    }
  }

  // ── Verify ───────────────────────────────────────────────────────────────
  const cols = await sql<{ column_name: string; data_type: string; is_nullable: string }[]>`
    SELECT column_name, data_type, is_nullable FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'categories'
      AND column_name = 'size_chart'
  `;
  const withChart = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM categories WHERE size_chart IS NOT NULL
  `;

  console.log(
    cols.length
      ? `✅ categories.size_chart present (${cols[0].data_type}, nullable: ${cols[0].is_nullable}).`
      : "⚠️  categories.size_chart missing.",
  );
  console.log(`ℹ️  ${withChart[0].n} categories currently have a chart (expected 0 on first run).`);

  await sql.end();
}

main().catch((err) => {
  console.error("❌ apply-category-size-chart-column failed:", err);
  process.exit(1);
});
