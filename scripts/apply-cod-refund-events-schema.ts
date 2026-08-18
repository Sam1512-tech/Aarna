/**
 * Additive schema migration for feat/cash-on-delivery, part 2.
 *
 * order_refund_events was originally created lazily (ensureOrderRefundEventsTable
 * in lib/db/queries/orders.ts) with razorpay_refund_id NOT NULL UNIQUE — fine
 * when only real Razorpay refunds ever wrote to it. recordCodRefundSent
 * (lib/actions/admin/returns.ts) needs to write a row here too for a manually-
 * sent COD UPI refund, which has no Razorpay refund id at all. Makes the
 * column nullable and replaces the plain unique constraint with a partial
 * unique index (WHERE ... IS NOT NULL) — same pattern already applied to
 * credit_notes.razorpay_refund_id in apply-cod-schema.ts.
 *
 * Not run via `drizzle-kit push` — see the "db:push is not safe to run
 * blindly" gotcha in CLAUDE.md. Every statement here is additive/idempotent —
 * safe to re-run.
 *
 * Usage: npx tsx scripts/apply-cod-refund-events-schema.ts
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

  const [{ tableExists }] = await sql<{ tableExists: boolean }[]>`
    SELECT to_regclass('order_refund_events') IS NOT NULL AS "tableExists"
  `;
  if (!tableExists) {
    console.log("order_refund_events doesn't exist yet — nothing to migrate (it'll be created correctly on first use).");
    await sql.end();
    return;
  }

  console.log("🔎 Finding order_refund_events.razorpay_refund_id's real unique constraint name...");
  const constraints = await sql<{ conname: string }[]>`
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
    WHERE rel.relname = 'order_refund_events'
      AND att.attname = 'razorpay_refund_id'
      AND con.contype = 'u'
  `;
  console.log("Found:", JSON.stringify(constraints));

  for (const c of constraints) {
    console.log(`📐 Dropping existing unique constraint ${c.conname}...`);
    await sql.unsafe(`ALTER TABLE order_refund_events DROP CONSTRAINT IF EXISTS "${c.conname}"`);
  }

  console.log("📐 Making order_refund_events.razorpay_refund_id nullable...");
  await sql.unsafe(`ALTER TABLE order_refund_events ALTER COLUMN razorpay_refund_id DROP NOT NULL`);

  console.log("📐 Creating partial unique index order_refund_event_razorpay_refund_id_idx (no-op if it already exists)...");
  await sql.unsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS order_refund_event_razorpay_refund_id_idx
    ON order_refund_events (razorpay_refund_id)
    WHERE razorpay_refund_id IS NOT NULL
  `);

  // ── Verify ───────────────────────────────────────────────────────────────
  console.log("\n=== Verification ===");

  const col = await sql<{ column_name: string; is_nullable: string }[]>`
    SELECT column_name, is_nullable FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'order_refund_events' AND column_name = 'razorpay_refund_id'
  `;
  console.log("order_refund_events.razorpay_refund_id nullable:", JSON.stringify(col));

  const idx = await sql<{ indexname: string }[]>`
    SELECT indexname FROM pg_indexes
    WHERE tablename = 'order_refund_events' AND indexname = 'order_refund_event_razorpay_refund_id_idx'
  `;
  console.log("Partial unique index present:", idx.length > 0);

  await sql.end();
  console.log("\n✅ Migration complete.");
}

main().catch((err) => {
  console.error("❌ apply-cod-refund-events-schema failed:", err);
  process.exit(1);
});
