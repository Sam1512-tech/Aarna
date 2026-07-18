/**
 * Additive schema migration for the P1 unblockers (be/p1-unblockers).
 *
 * Not run via `drizzle-kit push` — see the "db:push is not safe to run
 * blindly" gotcha in CLAUDE.md. This script only ever adds columns/indexes —
 * nothing here is destructive, and every step is safe to re-run.
 *
 * Adds:
 *   - categories.image_url, categories.image_mobile_url — unblocks the
 *     category image picker (#140, sat unwired pending this column)
 *   - collections.is_homepage_feature — admin-picked "show this on the
 *     homepage" flag, with a partial unique index enforcing at most one
 *     featured collection at a time (avoids "which one wins" ambiguity)
 *
 * Usage: npx tsx scripts/apply-p1-unblockers-schema.ts
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

  console.log("📐 Adding categories.image_url / image_mobile_url...");
  await sql.unsafe(
    `ALTER TABLE categories ADD COLUMN IF NOT EXISTS image_url text`,
  );
  await sql.unsafe(
    `ALTER TABLE categories ADD COLUMN IF NOT EXISTS image_mobile_url text`,
  );

  console.log("📐 Adding collections.is_homepage_feature...");
  await sql.unsafe(
    `ALTER TABLE collections ADD COLUMN IF NOT EXISTS is_homepage_feature boolean NOT NULL DEFAULT false`,
  );
  await sql.unsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS collections_one_homepage_feature_idx
      ON collections (is_homepage_feature)
      WHERE is_homepage_feature = true
  `);

  // ── Verify ───────────────────────────────────────────────────────────────
  const catCols = await sql<{ column_name: string }[]>`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'categories'
      AND column_name IN ('image_url', 'image_mobile_url')
  `;
  const colCols = await sql<{ column_name: string }[]>`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'collections'
      AND column_name = 'is_homepage_feature'
  `;
  const idx = await sql<{ indexname: string }[]>`
    SELECT indexname FROM pg_indexes
    WHERE tablename = 'collections' AND indexname = 'collections_one_homepage_feature_idx'
  `;

  console.log(
    catCols.length === 2
      ? "✅ categories.image_url + image_mobile_url present."
      : `⚠️  categories missing columns (found: ${catCols.map((c) => c.column_name).join(", ")}).`,
  );
  console.log(
    colCols.length
      ? "✅ collections.is_homepage_feature present."
      : "⚠️  collections.is_homepage_feature missing.",
  );
  console.log(
    idx.length
      ? "✅ single-featured-collection unique index present."
      : "⚠️  unique index missing.",
  );

  await sql.end();
}

main().catch((err) => {
  console.error("❌ apply-p1-unblockers-schema failed:", err);
  process.exit(1);
});
