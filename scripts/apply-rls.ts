/**
 * Applies Row Level Security policies from lib/db/rls.sql.
 *
 * RLS is not managed by Drizzle (it lives outside the schema), so it must be
 * applied separately after `db:push`. Idempotent — safe to re-run.
 *
 * Usage: npm run db:rls   (or: npx tsx scripts/apply-rls.ts)
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error("❌ DIRECT_URL / DATABASE_URL not set.");
  process.exit(1);
}

const sql = postgres(url, { prepare: false });

async function applyRls() {
  const sqlText = readFileSync(new URL("../lib/db/rls.sql", import.meta.url), "utf8");

  // Strip comment lines, then split into individual statements.
  const statements = sqlText
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);

  console.log(`🔒 Applying RLS — ${statements.length} statements...`);
  for (const stmt of statements) {
    await sql.unsafe(stmt);
  }

  // Verify every public table now has RLS enabled.
  const rows = await sql<{ tablename: string; rowsecurity: boolean }[]>`
    SELECT tablename, rowsecurity FROM pg_tables
    WHERE schemaname = 'public' ORDER BY tablename`;
  const off = rows.filter((r) => !r.rowsecurity).map((r) => r.tablename);

  // Confirm the server-side (owner) connection still reads after enabling RLS.
  const probe = await sql`SELECT count(*)::int AS n FROM public.categories`;

  console.log(`\n✅ RLS enabled on ${rows.length - off.length}/${rows.length} tables.`);
  if (off.length) console.warn(`⚠️  Still disabled: ${off.join(", ")}`);
  console.log(`✅ Owner connection still reads (categories count = ${probe[0].n}).`);

  await sql.end();
}

applyRls().catch((err) => {
  console.error("❌ apply-rls failed:", err);
  process.exit(1);
});
