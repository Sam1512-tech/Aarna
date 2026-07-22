/**
 * Additive schema migration for the checkout stock-reservation fix
 * (fe/checkout-stock-race-and-rto-guard).
 *
 * Not run via `drizzle-kit push` — see the "db:push is not safe to run
 * blindly" gotcha in CLAUDE.md. This script only ever adds a column —
 * nothing here is destructive, and it's safe to re-run.
 *
 * Adds:
 *   - orders.stock_reserved (boolean, default false) — true only for orders
 *     whose stock was actually decremented at checkout (initCheckout's new
 *     atomic reservation). Every pre-existing order defaults to false,
 *     which is correct: they predate the reservation logic entirely, so
 *     their stock was never actually taken. Without this column,
 *     releaseExpiredCheckoutHolds / markOrderPaymentFailed would "restore"
 *     stock for those old orders too, inflating real stock counts for
 *     whatever variants they reference — this was caught live against the
 *     dev DB while verifying the fix (see PR description).
 *
 * Usage: npx tsx scripts/apply-stock-reserved-column.ts
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

  console.log("📐 Adding orders.stock_reserved...");
  await sql.unsafe(
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS stock_reserved boolean NOT NULL DEFAULT false`,
  );

  // ── Verify ───────────────────────────────────────────────────────────────
  const cols = await sql<{ column_name: string }[]>`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders'
      AND column_name = 'stock_reserved'
  `;

  console.log(
    cols.length
      ? "✅ orders.stock_reserved present."
      : "⚠️  orders.stock_reserved missing.",
  );

  await sql.end();
}

main().catch((err) => {
  console.error("❌ apply-stock-reserved-column failed:", err);
  process.exit(1);
});
