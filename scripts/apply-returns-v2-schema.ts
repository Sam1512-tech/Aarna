/**
 * Additive schema migration for returns v2 (be/returns-schema-v2).
 *
 * Not run via `drizzle-kit push` — see the "db:push is not safe to run
 * blindly" gotcha in CLAUDE.md (push is declarative against schema.ts and
 * doesn't know about RLS or the order_seq sequence; it has previously
 * proposed disabling RLS and dropping the sequence to "reconcile" drift).
 * This script only ever adds columns/types and backfills — nothing it does
 * is destructive, and every step is safe to re-run.
 *
 * Adds:
 *   - orders.delivered_at
 *   - returns.type, desired_variant_id, photos, outbound_awb,
 *     rejection_reason, admin_note, qc_outcome
 *   - enums return_type, return_qc_outcome
 *
 * Backfills:
 *   - orders.delivered_at from updated_at, for orders already delivered
 *   - returns.type = 'exchange' + strips the "Exchange requested." marker
 *     prefix from `reason`, for rows using the old prefix-hack convention
 *     (see lib/exchange.ts)
 *
 * Usage: npx tsx scripts/apply-returns-v2-schema.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import postgres from "postgres";

// Prefer the direct connection (matches CLAUDE.md convention for schema
// changes), but fall back to the pooler if it's unreachable from this
// environment — every statement here is a single additive DDL/UPDATE run
// outside an explicit multi-statement transaction, which pgbouncer
// transaction-mode pooling handles fine.
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

const EXCHANGE_PREFIX = "Exchange requested.";

async function main() {
  const sql = await connect();

  console.log("📐 Adding enums (no-op if they already exist)...");
  await sql.unsafe(`
    DO $$ BEGIN
      CREATE TYPE return_type AS ENUM ('return', 'exchange');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);
  await sql.unsafe(`
    DO $$ BEGIN
      CREATE TYPE return_qc_outcome AS ENUM ('pass', 'fail');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);

  console.log("📐 Adding orders.delivered_at...");
  await sql.unsafe(
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_at timestamptz`,
  );

  console.log("📐 Adding returns v2 columns...");
  await sql.unsafe(
    `ALTER TABLE returns ADD COLUMN IF NOT EXISTS type return_type NOT NULL DEFAULT 'return'`,
  );
  await sql.unsafe(`
    ALTER TABLE returns ADD COLUMN IF NOT EXISTS desired_variant_id uuid
      REFERENCES product_variants(id) ON DELETE SET NULL
  `);
  await sql.unsafe(
    `ALTER TABLE returns ADD COLUMN IF NOT EXISTS photos jsonb NOT NULL DEFAULT '[]'::jsonb`,
  );
  await sql.unsafe(
    `ALTER TABLE returns ADD COLUMN IF NOT EXISTS outbound_awb varchar(60)`,
  );
  await sql.unsafe(
    `ALTER TABLE returns ADD COLUMN IF NOT EXISTS rejection_reason varchar(60)`,
  );
  await sql.unsafe(
    `ALTER TABLE returns ADD COLUMN IF NOT EXISTS admin_note text`,
  );
  await sql.unsafe(
    `ALTER TABLE returns ADD COLUMN IF NOT EXISTS qc_outcome return_qc_outcome`,
  );

  console.log("🔁 Backfilling orders.delivered_at from updated_at...");
  const deliveredBackfill = await sql`
    UPDATE orders
    SET delivered_at = updated_at
    WHERE fulfillment_status = 'delivered'
      AND delivered_at IS NULL
    RETURNING id
  `;
  console.log(`   ${deliveredBackfill.length} order(s) backfilled.`);

  console.log("🔁 Backfilling returns.type from the old prefix convention...");
  // regexp_replace, not substring(... from N) — with a *parameterized* start
  // position, Postgres's substring() returns NULL (not '') once the position
  // is beyond the string's length, which every zero-detail historical row
  // hits exactly (violates returns.reason's NOT NULL). Confirmed by testing
  // directly against this DB: substring(reason from $1) -> NULL,
  // regexp_replace(reason, pattern, '') -> '' for the same row.
  const escapedPrefix = EXCHANGE_PREFIX.replace(/[.]/g, "\\$&");
  const exchangeBackfill = await sql`
    UPDATE returns
    SET type = 'exchange',
        reason = trim(regexp_replace(reason, ${"^" + escapedPrefix}, ${""}))
    WHERE reason LIKE ${EXCHANGE_PREFIX + "%"}
    RETURNING id
  `;
  console.log(`   ${exchangeBackfill.length} return(s) reclassified as exchange.`);

  // ── Verify ───────────────────────────────────────────────────────────────
  const cols = await sql<{ column_name: string }[]>`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'returns'
    ORDER BY column_name
  `;
  const expected = [
    "type",
    "desired_variant_id",
    "photos",
    "outbound_awb",
    "rejection_reason",
    "admin_note",
    "qc_outcome",
  ];
  const have = new Set(cols.map((c) => c.column_name));
  const missing = expected.filter((c) => !have.has(c));

  const orderCols = await sql<{ column_name: string }[]>`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'delivered_at'
  `;

  const typeCounts = await sql<{ type: string; n: number }[]>`
    SELECT type, count(*)::int AS n FROM returns GROUP BY type
  `;

  console.log("\n✅ returns columns present:", expected.filter((c) => have.has(c)).join(", "));
  if (missing.length) console.warn("⚠️  Still missing:", missing.join(", "));
  console.log(
    orderCols.length
      ? "✅ orders.delivered_at present."
      : "⚠️  orders.delivered_at missing.",
  );
  console.log("✅ returns by type:", typeCounts);

  await sql.end();
}

main().catch((err) => {
  console.error("❌ apply-returns-v2-schema failed:", err);
  process.exit(1);
});
