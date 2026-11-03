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
  await sql.unsafe(
    `ALTER TABLE categories ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true`,
  );

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
