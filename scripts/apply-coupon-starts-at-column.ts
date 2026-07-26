/**
 * Additive schema migration for the coupon start-date feature.
 *
 * Not run via `drizzle-kit push` — see the "db:push is not safe to run
 * blindly" gotcha in CLAUDE.md. This script only ever adds a column —
 * nothing here is destructive, and it's safe to re-run.
 *
 * Adds:
 *   - coupons.starts_at (timestamptz, nullable) — a coupon with no start
 *     date is valid immediately, matching the existing expires_at "null =
 *     no end date" convention. Every pre-existing coupon defaults to NULL,
 *     which is correct: they were never meant to have a future-start gate.
 *
 * Usage: npx tsx scripts/apply-coupon-starts-at-column.ts
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

  console.log("📐 Adding coupons.starts_at...");
  await sql.unsafe(
    `ALTER TABLE coupons ADD COLUMN IF NOT EXISTS starts_at timestamptz`,
  );

  // ── Verify ───────────────────────────────────────────────────────────────
  const cols = await sql<{ column_name: string }[]>`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'coupons'
      AND column_name = 'starts_at'
  `;

  console.log(
    cols.length
      ? "✅ coupons.starts_at present."
      : "⚠️  coupons.starts_at missing.",
  );

  await sql.end();
}

main().catch((err) => {
  console.error("❌ apply-coupon-starts-at-column failed:", err);
  process.exit(1);
});
