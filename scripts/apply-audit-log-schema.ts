/**
 * Additive schema migration for the admin action audit log
 * (lib/audit/log-admin-action.ts).
 *
 * Not run via `drizzle-kit push` — see the "db:push is not safe to run
 * blindly" gotcha in CLAUDE.md. Brand-new table, nothing existing touched.
 *
 * Adds:
 *   - admin_audit_log table + indexes for the common lookups (by entity,
 *     by admin, by recency)
 *   - RLS enabled (default-deny)
 *
 * Usage: npx tsx scripts/apply-audit-log-schema.ts
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
  const sql = postgres(pooled!, { prepare: false, connect_timeout: 8 });
  console.log("🔌 Connected via DATABASE_URL (pooler).");
  return sql;
}

async function main() {
  const sql = await connect();

  console.log("Creating admin_audit_log table...");
  await sql`
    CREATE TABLE IF NOT EXISTS admin_audit_log (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      admin_id uuid NOT NULL REFERENCES admins(id),
      action varchar(80) NOT NULL,
      entity_type varchar(60) NOT NULL,
      entity_id varchar(120),
      metadata jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS admin_audit_log_entity_idx
    ON admin_audit_log (entity_type, entity_id)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS admin_audit_log_admin_idx
    ON admin_audit_log (admin_id)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS admin_audit_log_created_at_idx
    ON admin_audit_log (created_at DESC)
  `;

  console.log("Enabling RLS (default-deny)...");
  await sql`ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY`;

  const check = await sql<{ rowsecurity: boolean }[]>`
    SELECT rowsecurity FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'admin_audit_log'`;
  console.log(`✅ admin_audit_log exists, RLS enabled: ${check[0]?.rowsecurity}`);

  await sql.end();
}

main().catch((err) => {
  console.error("❌ apply-audit-log-schema failed:", err);
  process.exit(1);
});
