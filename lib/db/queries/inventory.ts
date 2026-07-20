import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

const { productVariants, inventoryMovements } = schema;

type MovementReason = "purchase" | "sale" | "return" | "adjustment" | "manual";

export interface StockMovementLine {
  variantId: string;
  quantity: number; // always positive — direction is applied separately
}

/**
 * Atomically applies a signed stock change to each line inside one
 * transaction, row-locking every variant (SELECT ... FOR UPDATE) so
 * concurrent movements on the same variant (two sales, a sale racing a
 * restock) can't silently lose an update the way a plain read-then-write
 * would under Postgres's default READ COMMITTED isolation.
 *
 * Decrements clamp at 0 rather than throwing — this runs from the Razorpay
 * webhook after payment has already captured, so a variant that's oversold
 * (or was deleted after the order was placed) must never block recording the
 * paid order. The *actual* applied delta (not the requested one) is what
 * gets logged to inventory_movements, so the audit trail stays accurate.
 */
export async function applyStockMovement(
  lines: StockMovementLine[],
  direction: 1 | -1,
  reason: MovementReason,
  referenceId: string,
) {
  if (lines.length === 0) return;

  await db.transaction(async (tx) => {
    for (const line of lines) {
      const [variant] = await tx
        .select({ stock: productVariants.stock })
        .from(productVariants)
        .where(eq(productVariants.id, line.variantId))
        .for("update");
      if (!variant) continue;

      const newStock = Math.max(0, variant.stock + direction * line.quantity);
      const actualDelta = newStock - variant.stock;
      if (actualDelta === 0) continue;

      await tx
        .update(productVariants)
        .set({ stock: newStock })
        .where(eq(productVariants.id, line.variantId));

      await tx.insert(inventoryMovements).values({
        variantId: line.variantId,
        delta: actualDelta,
        reason,
        referenceId,
      });
    }
  });
}
