import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { currentFinancialYear, formatInvoiceNumber } from "./generate";

/**
 * Atomically generates the next invoice number for the current financial year.
 * Uses a Postgres sequence (created on first call) — safe under concurrent requests.
 */
export async function nextInvoiceNumber(): Promise<string> {
  await db.execute(sql`CREATE SEQUENCE IF NOT EXISTS invoice_seq START 1`);
  const result = await db.execute(sql`SELECT nextval('invoice_seq')::int AS seq`);
  // drizzle returns rows array
  const rows = result as unknown as { seq: number }[];
  const seq = Number(rows[0].seq);
  return formatInvoiceNumber(currentFinancialYear(), seq);
}
