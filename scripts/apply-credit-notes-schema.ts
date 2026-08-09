/**
 * Additive schema migration for GST credit notes (feat/gst-credit-notes).
 *
 * Not run via `drizzle-kit push` — see the "db:push is not safe to run
 * blindly" gotcha in CLAUDE.md. This script only ever creates a new table —
 * nothing it does is destructive, and every step is safe to re-run.
 *
 * Adds:
 *   - credit_notes table (order/return link, razorpay_refund_id, sequential
 *     credit_note_number, GST breakdown, needs_review flag)
 *   - RLS enabled on credit_notes (default-deny, matches every other table —
 *     see lib/db/rls.sql, which is also updated to include this table for
 *     future `npm run db:rls` re-runs)
 *
 * Usage: npx tsx scripts/apply-credit-notes-schema.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import postgres from "postgres";

// Prefer the direct connection (matches CLAUDE.md convention for schema
// changes), but fall back to the pooler if it's unreachable from this
// environment.
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

  console.log("📐 Creating credit_notes table (no-op if it already exists)...");
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS credit_notes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      return_id uuid REFERENCES returns(id) ON DELETE SET NULL,
      razorpay_refund_id varchar(60) NOT NULL UNIQUE,
      credit_note_number varchar(30) NOT NULL UNIQUE,
      refunded_amount integer NOT NULL,
      taxable_value integer NOT NULL,
      cgst integer NOT NULL DEFAULT 0,
      sgst integer NOT NULL DEFAULT 0,
      igst integer NOT NULL DEFAULT 0,
      rate_breakdown jsonb NOT NULL,
      needs_review boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  console.log("📐 Adding credit_notes(order_id) index (no-op if it already exists)...");
  await sql.unsafe(`
    CREATE INDEX IF NOT EXISTS credit_note_order_idx ON credit_notes (order_id)
  `);

  console.log("🔒 Enabling RLS on credit_notes (default-deny, matches every other table)...");
  await sql.unsafe(`ALTER TABLE public.credit_notes ENABLE ROW LEVEL SECURITY`);

  // ── Verify ───────────────────────────────────────────────────────────────
  const cols = await sql<{ column_name: string }[]>`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'credit_notes'
    ORDER BY column_name
  `;
  const expected = [
    "id",
    "order_id",
    "return_id",
    "razorpay_refund_id",
    "credit_note_number",
    "refunded_amount",
    "taxable_value",
    "cgst",
    "sgst",
    "igst",
    "rate_breakdown",
    "needs_review",
    "created_at",
  ];
  const have = new Set(cols.map((c) => c.column_name));
  const missing = expected.filter((c) => !have.has(c));

  const rls = await sql<{ relrowsecurity: boolean }[]>`
    SELECT relrowsecurity FROM pg_class WHERE relname = 'credit_notes'
  `;

  console.log("\n✅ credit_notes columns present:", expected.filter((c) => have.has(c)).join(", "));
  if (missing.length) console.warn("⚠️  Still missing:", missing.join(", "));
  console.log(
    rls[0]?.relrowsecurity
      ? "✅ RLS enabled on credit_notes."
      : "⚠️  RLS NOT enabled on credit_notes.",
  );

  await sql.end();
}

main().catch((err) => {
  console.error("❌ apply-credit-notes-schema failed:", err);
  process.exit(1);
});
