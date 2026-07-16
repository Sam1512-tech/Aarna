/**
 * One-off migration for the returns-v2 rework.
 *
 * Do NOT use `npm run db:push` for this — Drizzle push doesn't know about
 * out-of-band things (RLS policies, the `order_seq` sequence) and would
 * propose dropping them. This script uses raw SQL against the direct
 * connection to add the new bits idempotently.
 *
 * Adds:
 *   - return_status enum values: in_transit_to_seller, qc_failed,
 *     exchange_shipped, exchange_delivered
 *   - new enums: return_type, qc_outcome
 *   - orders.delivered_at (timestamp)
 *   - returns.{type, desired_variant_id, photos, reverse_awb, outbound_awb,
 *     rejection_reason, admin_note, qc_outcome}
 *
 * Backfills:
 *   - orders.delivered_at ← updated_at where fulfillment_status='delivered'
 *   - returns.type ← 'exchange' where reason begins with the old marker
 *   - strips the "Exchange requested." prefix from reason so the marker
 *     hack is fully gone
 *
 * Idempotent: safe to re-run. Enum values use IF NOT EXISTS; columns and
 * types use IF NOT EXISTS / DO $$ EXCEPTION guards.
 *
 * Run:  npm run db:apply-returns-v2
 */
import "dotenv/config";
import postgres from "postgres";

const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL or DIRECT_URL must be set in .env.local");
  process.exit(1);
}

const sql = postgres(url, { max: 1 });

async function run() {
  // Enum extensions cannot run inside a transaction on some Postgres
  // versions ("ALTER TYPE … ADD VALUE cannot be used in a transaction block"
  // on <12), so we do them individually outside the wrapping BEGIN.
  await sql`ALTER TYPE return_status ADD VALUE IF NOT EXISTS 'in_transit_to_seller' AFTER 'picked'`;
  await sql`ALTER TYPE return_status ADD VALUE IF NOT EXISTS 'qc_failed' AFTER 'received'`;
  await sql`ALTER TYPE return_status ADD VALUE IF NOT EXISTS 'exchange_shipped' AFTER 'refunded'`;
  await sql`ALTER TYPE return_status ADD VALUE IF NOT EXISTS 'exchange_delivered' AFTER 'exchange_shipped'`;

  // Rest can be a single transaction — either all applies or nothing does.
  await sql.begin(async (tx) => {
    // New enum types
    await tx`DO $$ BEGIN
      CREATE TYPE return_type AS ENUM ('return', 'exchange');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`;
    await tx`DO $$ BEGIN
      CREATE TYPE qc_outcome AS ENUM ('pass', 'fail');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`;

    // orders.delivered_at
    await tx`ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_at timestamptz`;

    // returns: new columns
    await tx`ALTER TABLE returns ADD COLUMN IF NOT EXISTS "type" return_type NOT NULL DEFAULT 'return'`;
    await tx`ALTER TABLE returns
             ADD COLUMN IF NOT EXISTS desired_variant_id uuid
             REFERENCES product_variants(id) ON DELETE SET NULL`;
    await tx`ALTER TABLE returns ADD COLUMN IF NOT EXISTS photos jsonb NOT NULL DEFAULT '[]'::jsonb`;
    await tx`ALTER TABLE returns ADD COLUMN IF NOT EXISTS reverse_awb varchar(60)`;
    await tx`ALTER TABLE returns ADD COLUMN IF NOT EXISTS outbound_awb varchar(60)`;
    await tx`ALTER TABLE returns ADD COLUMN IF NOT EXISTS rejection_reason text`;
    await tx`ALTER TABLE returns ADD COLUMN IF NOT EXISTS admin_note text`;
    await tx`ALTER TABLE returns ADD COLUMN IF NOT EXISTS qc_outcome qc_outcome`;

    // Backfills
    const deliveredBackfill = await tx`
      UPDATE orders
      SET delivered_at = updated_at
      WHERE fulfillment_status = 'delivered' AND delivered_at IS NULL
      RETURNING id
    `;
    console.log(
      `  backfilled orders.delivered_at on ${deliveredBackfill.count} row(s)`,
    );

    const typedExchange = await tx`
      UPDATE returns
      SET "type" = 'exchange'
      WHERE reason LIKE 'Exchange requested.%' AND "type" = 'return'
      RETURNING id
    `;
    console.log(
      `  tagged ${typedExchange.count} existing exchange row(s)`,
    );

    // Strip the marker so nothing downstream needs the prefix hack.
    // Trailing whitespace after "Exchange requested." is also cleaned up.
    const cleaned = await tx`
      UPDATE returns
      SET reason = regexp_replace(reason, '^Exchange requested\.\s*', '')
      WHERE reason LIKE 'Exchange requested.%'
      RETURNING id
    `;
    console.log(
      `  stripped 'Exchange requested.' prefix from ${cleaned.count} row(s)`,
    );
  });

  console.log("returns-schema-v2 applied ✓");
  await sql.end();
}

run().catch(async (err) => {
  console.error(err);
  await sql.end();
  process.exit(1);
});
