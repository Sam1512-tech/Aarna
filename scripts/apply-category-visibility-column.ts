/**
 * Additive schema migration for category visibility (hide a category from the
 * storefront while it's being set up).
 *
 * Not run via `drizzle-kit push` — see the "db:push is not safe to run
 * blindly" gotcha in CLAUDE.md. This script only ever adds a column —
 * nothing here is destructive, and it's safe to re-run.
 *
 * Adds:
 *   - categories.is_active (boolean, NOT NULL, default true) — default true
 *     so every existing category (Dresses, Tops) keeps showing on the
 *     storefront exactly as before. Postgres applies a constant default to
 *     existing rows without rewriting the table.
 *
 * Run this BEFORE the code that reads the column is deployed: the old code
 * ignores the extra column, but the new code selects it and would fail on
 * every storefront page if it didn't exist yet.
 *
 * Usage: npx tsx scripts/apply-category-visibility-column.ts
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

  console.log("📐 Adding categories.is_active...");
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
          `ALTER TABLE categories ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true`,
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
  const cols = await sql<{ column_name: string }[]>`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'categories'
      AND column_name = 'is_active'
  `;
  const hidden = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM categories WHERE is_active = false
  `;

  console.log(
    cols.length
      ? "✅ categories.is_active present."
      : "⚠️  categories.is_active missing.",
  );
  console.log(`ℹ️  ${hidden[0].n} categories currently inactive (expected 0).`);

  await sql.end();
}

main().catch((err) => {
  console.error("❌ apply-category-visibility-column failed:", err);
  process.exit(1);
});
