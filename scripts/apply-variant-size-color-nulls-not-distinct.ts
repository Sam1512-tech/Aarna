/**
 * Tightens product_variants' (product_id, size, color) unique index to
 * NULLS NOT DISTINCT (Postgres 15+).
 *
 * Not run via `drizzle-kit push` — see the "db:push is not safe to run
 * blindly" gotcha in CLAUDE.md.
 *
 * Why: a plain unique index treats every NULL as distinct from every other
 * NULL, so two variants of the same size with color left unset (the common
 * case for products that don't vary by color) could both be created with no
 * error — silently splitting one size's stock across two SKUs. Confirmed
 * live on the dev DB: a duplicate pair already existed (product "hello",
 * size XS, both color NULL) purely from manual test-data entry, with zero
 * references from cart_items/order_items on either row.
 *
 * This script:
 *   1. Finds any existing (product_id, size) groups with color IS NULL and
 *      more than one row. For each, keeps the oldest row and deletes the
 *      rest, but ONLY if every row being deleted has zero references in
 *      cart_items/order_items — if any duplicate has real references, the
 *      script aborts without touching data or adding the constraint, so a
 *      real conflict always goes to a human instead of being guessed at.
 *   2. Drops the old plain unique index and recreates it as a UNIQUE
 *      constraint with NULLS NOT DISTINCT, same name
 *      (variant_product_size_color_idx), so it matches lib/db/schema.ts's
 *      `unique(...).nullsNotDistinct()` declaration exactly — this keeps a
 *      future `db:push` from seeing drift and proposing to revert it.
 *
 * Safe to re-run — step 1 is a no-op once no duplicates remain, and step 2
 * uses IF EXISTS / a duplicate-constraint-name guard.
 *
 * Usage: npx tsx scripts/apply-variant-size-color-nulls-not-distinct.ts
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

  console.log("🔍 Checking for existing (product_id, size, color=NULL) duplicates...");
  const groups = await sql<{ product_id: string; size: string | null }[]>`
    select product_id, size
    from product_variants
    where color is null
    group by product_id, size
    having count(*) > 1
  `;

  if (groups.length > 0) {
    console.log(`  Found ${groups.length} duplicate group(s).`);
    for (const g of groups) {
      const rows = await sql<
        { id: string; sku: string; created_at: Date; in_carts: number; in_orders: number }[]
      >`
        select pv.id, pv.sku, pv.created_at,
               (select count(*)::int from cart_items ci where ci.variant_id = pv.id) as in_carts,
               (select count(*)::int from order_items oi where oi.variant_id = pv.id) as in_orders
        from product_variants pv
        where pv.product_id = ${g.product_id} and pv.size is not distinct from ${g.size} and pv.color is null
        order by pv.created_at asc
      `;

      const [keep, ...rest] = rows;
      console.log(
        `  product ${g.product_id} size ${g.size ?? "NULL"}: keeping ${keep.sku} (oldest), ${rest.length} candidate(s) to remove.`,
      );

      const referenced = rest.filter((r) => r.in_carts > 0 || r.in_orders > 0);
      if (referenced.length > 0) {
        console.error(
          `❌ Duplicate variant(s) have real references (cart/order) — aborting without changes. Resolve manually: ${JSON.stringify(referenced)}`,
        );
        await sql.end();
        process.exit(1);
      }

      for (const r of rest) {
        await sql`delete from product_variants where id = ${r.id}`;
        console.log(`    deleted unreferenced duplicate ${r.sku} (${r.id})`);
      }
    }
  } else {
    console.log("  None found.");
  }

  console.log("📐 Replacing variant_product_size_color_idx with a NULLS NOT DISTINCT constraint...");
  await sql.unsafe(`DROP INDEX IF EXISTS variant_product_size_color_idx`);
  await sql.unsafe(`
    ALTER TABLE product_variants
    DROP CONSTRAINT IF EXISTS variant_product_size_color_idx
  `);
  await sql.unsafe(`
    ALTER TABLE product_variants
    ADD CONSTRAINT variant_product_size_color_idx
    UNIQUE NULLS NOT DISTINCT (product_id, size, color)
  `);

  // ── Verify ───────────────────────────────────────────────────────────────
  const [constraint] = await sql<{ nulls_not_distinct: boolean }[]>`
    select i.indnullsnotdistinct as nulls_not_distinct
    from pg_constraint c
    join pg_index i on i.indexrelid = c.conindid
    where c.conname = 'variant_product_size_color_idx'
  `;
  console.log(
    constraint?.nulls_not_distinct
      ? "✅ variant_product_size_color_idx is now NULLS NOT DISTINCT."
      : "⚠️  Could not confirm the constraint — check manually.",
  );

  const remaining = await sql`
    select product_id, size, count(*) from product_variants
    where color is null group by product_id, size having count(*) > 1
  `;
  console.log(
    remaining.length === 0
      ? "✅ No remaining null-color duplicates."
      : `⚠️  ${remaining.length} duplicate group(s) still present.`,
  );

  await sql.end();
}

main().catch((err) => {
  console.error("❌ apply-variant-size-color-nulls-not-distinct failed:", err);
  process.exit(1);
});
