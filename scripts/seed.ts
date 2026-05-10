/**
 * Seed script — run once to populate base data.
 * Usage: npx tsx scripts/seed.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { categories } from "@/lib/db/schema";

const client = postgres(process.env.DATABASE_URL!, { prepare: false });
const db = drizzle(client);

async function seed() {
  console.log("🌱 Seeding database...");

  // ── Categories ────────────────────────────────────────────────────────────
  console.log("→ Inserting categories...");
  await db
    .insert(categories)
    .values([
      { name: "Dresses", slug: "dresses", sortOrder: 1 },
      { name: "Tops", slug: "tops", sortOrder: 2 },
    ])
    .onConflictDoNothing();

  console.log("✅ Seed complete.");
  await client.end();
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
