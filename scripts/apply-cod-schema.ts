/**
 * Additive schema migration for feat/cash-on-delivery.
 *
 * Not run via `drizzle-kit push` — see the "db:push is not safe to run
 * blindly" gotcha in CLAUDE.md. Every statement here is additive and
 * idempotent (CREATE ... IF NOT EXISTS / ADD VALUE IF NOT EXISTS / ADD
 * COLUMN IF NOT EXISTS) — safe to re-run.
 *
 * Adds:
 *   - order_payment_method enum ("prepaid" | "cod")
 *   - order_payment_status enum gains "cod_pending"
 *   - return_status enum gains "refund_pending"
 *   - orders.payment_method (default "prepaid"), orders.cod_fee (default 0)
 *   - returns.refund_upi_id, returns.cod_refund_reference
 *   - credit_notes.razorpay_refund_id becomes nullable, its plain unique
 *     constraint is replaced with a partial unique index (WHERE ... IS NOT
 *     NULL) — a manually-refunded COD credit note has no real Razorpay
 *     refund to link, but every row that DOES have one must still stay
 *     unique.
 *
 * Usage: npx tsx scripts/apply-cod-schema.ts
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

  console.log("📐 Creating order_payment_method enum (no-op if it already exists)...");
  await sql.unsafe(`
    DO $$ BEGIN
      CREATE TYPE order_payment_method AS ENUM ('prepaid', 'cod');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);

  console.log("📐 Adding 'cod_pending' to order_payment_status enum...");
  await sql.unsafe(`ALTER TYPE order_payment_status ADD VALUE IF NOT EXISTS 'cod_pending'`);

  console.log("📐 Adding 'refund_pending' to return_status enum...");
  await sql.unsafe(`ALTER TYPE return_status ADD VALUE IF NOT EXISTS 'refund_pending'`);

  console.log("📐 Adding orders.payment_method / orders.cod_fee (no-op if already present)...");
  await sql.unsafe(`
    ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS payment_method order_payment_method NOT NULL DEFAULT 'prepaid',
      ADD COLUMN IF NOT EXISTS cod_fee integer NOT NULL DEFAULT 0
  `);

  console.log("📐 Adding returns.refund_upi_id / returns.cod_refund_reference (no-op if already present)...");
  await sql.unsafe(`
    ALTER TABLE returns
      ADD COLUMN IF NOT EXISTS refund_upi_id varchar(60),
      ADD COLUMN IF NOT EXISTS cod_refund_reference varchar(120)
  `);

  console.log("🔎 Finding credit_notes.razorpay_refund_id's real unique constraint name...");
  const constraints = await sql<{ conname: string }[]>`
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
    WHERE rel.relname = 'credit_notes'
      AND att.attname = 'razorpay_refund_id'
      AND con.contype = 'u'
  `;
  console.log("Found:", JSON.stringify(constraints));

  if (constraints.length > 0) {
    for (const c of constraints) {
      console.log(`📐 Dropping existing unique constraint ${c.conname}...`);
      await sql.unsafe(`ALTER TABLE credit_notes DROP CONSTRAINT IF EXISTS "${c.conname}"`);
    }
  } else {
    console.log("No existing plain unique constraint found on credit_notes.razorpay_refund_id — skipping drop.");
  }

  console.log("📐 Making credit_notes.razorpay_refund_id nullable...");
  await sql.unsafe(`ALTER TABLE credit_notes ALTER COLUMN razorpay_refund_id DROP NOT NULL`);

  console.log("📐 Creating partial unique index credit_note_razorpay_refund_id_idx (no-op if it already exists)...");
  await sql.unsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS credit_note_razorpay_refund_id_idx
    ON credit_notes (razorpay_refund_id)
    WHERE razorpay_refund_id IS NOT NULL
  `);

  // ── Verify ───────────────────────────────────────────────────────────────
  console.log("\n=== Verification ===");

  const orderCols = await sql<{ column_name: string; column_default: string | null; is_nullable: string }[]>`
    SELECT column_name, column_default, is_nullable FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name IN ('payment_method', 'cod_fee')
  `;
  console.log("orders columns:", JSON.stringify(orderCols));

  const returnCols = await sql<{ column_name: string }[]>`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'returns' AND column_name IN ('refund_upi_id', 'cod_refund_reference')
  `;
  console.log("returns columns:", JSON.stringify(returnCols));

  const cnCol = await sql<{ column_name: string; is_nullable: string }[]>`
    SELECT column_name, is_nullable FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'credit_notes' AND column_name = 'razorpay_refund_id'
  `;
  console.log("credit_notes.razorpay_refund_id nullable:", JSON.stringify(cnCol));

  const cnIdx = await sql<{ indexname: string }[]>`
    SELECT indexname FROM pg_indexes
    WHERE tablename = 'credit_notes' AND indexname = 'credit_note_razorpay_refund_id_idx'
  `;
  console.log("credit_notes partial unique index present:", cnIdx.length > 0);

  const paymentStatusValues = await sql<{ enumlabel: string }[]>`
    SELECT enumlabel FROM pg_enum
    WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'order_payment_status')
    ORDER BY enumsortorder
  `;
  console.log("order_payment_status values:", paymentStatusValues.map((r) => r.enumlabel));

  const returnStatusValues = await sql<{ enumlabel: string }[]>`
    SELECT enumlabel FROM pg_enum
    WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'return_status')
    ORDER BY enumsortorder
  `;
  console.log("return_status values:", returnStatusValues.map((r) => r.enumlabel));

  const paymentMethodValues = await sql<{ enumlabel: string }[]>`
    SELECT enumlabel FROM pg_enum
    WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'order_payment_method')
    ORDER BY enumsortorder
  `;
  console.log("order_payment_method values:", paymentMethodValues.map((r) => r.enumlabel));

  await sql.end();
  console.log("\n✅ Migration complete.");
}

main().catch((err) => {
  console.error("❌ apply-cod-schema failed:", err);
  process.exit(1);
});
