/**
 * Additive schema migration for feat/gst-credit-notes' adversarial-review
 * follow-up: a partial unique index on returns.razorpay_refund_id.
 *
 * Not run via `drizzle-kit push` — see the "db:push is not safe to run
 * blindly" gotcha in CLAUDE.md. This only adds an index — nothing
 * destructive, safe to re-run.
 *
 * Why: recordRefund's credit-note "precise match" query
 * (lib/db/queries/orders.ts) looks up a `returns` row by razorpayRefundId
 * and assumes at most one match. Nothing in the DB actually enforced that —
 * it only held by application convention (markReturnQc always producing a
 * fresh Razorpay refund id). A partial index (most returns never reach a
 * refund, so the column is null far more often than not — a plain unique
 * constraint would wrongly collide on those nulls... except Postgres
 * already treats distinct NULLs as non-equal by default, so a plain unique
 * index would technically work too, but a partial index is more honest
 * about intent and slightly smaller) makes the invariant real instead of
 * assumed.
 *
 * Usage: npx tsx scripts/apply-returns-refund-id-index.ts
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

  console.log("🔎 Checking for existing duplicate razorpay_refund_id values first (would block the index)...");
  const dupes = await sql<{ razorpay_refund_id: string; count: number }[]>`
    SELECT razorpay_refund_id, count(*)::int AS count
    FROM returns
    WHERE razorpay_refund_id IS NOT NULL
    GROUP BY razorpay_refund_id
    HAVING count(*) > 1
  `;
  if (dupes.length > 0) {
    console.error("❌ Found duplicate razorpay_refund_id values — index would fail. Not proceeding:", dupes);
    await sql.end();
    process.exit(1);
  }
  console.log("✅ No duplicates found.");

  console.log("📐 Adding partial unique index on returns(razorpay_refund_id) (no-op if it already exists)...");
  await sql.unsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS return_razorpay_refund_id_idx
    ON returns (razorpay_refund_id)
    WHERE razorpay_refund_id IS NOT NULL
  `);

  const idx = await sql<{ indexname: string }[]>`
    SELECT indexname FROM pg_indexes
    WHERE tablename = 'returns' AND indexname = 'return_razorpay_refund_id_idx'
  `;
  console.log(
    idx.length > 0
      ? "✅ return_razorpay_refund_id_idx present."
      : "⚠️  return_razorpay_refund_id_idx NOT found after creation attempt.",
  );

  await sql.end();
}

main().catch((err) => {
  console.error("❌ apply-returns-refund-id-index failed:", err);
  process.exit(1);
});
