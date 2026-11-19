import { and, asc, eq } from "drizzle-orm";
import { planImageOrder } from "@/lib/admin/image-order";
import { db, schema } from "@/lib/db";

const { productImages } = schema;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Rewrites one product's gallery order inside the caller's transaction and
 * returns the final order. Every image of the product is renumbered 0, 1, 2…,
 * which also tidies any duplicate or gappy `sort_order` values left by earlier
 * adds and deletes.
 *
 * The product's image rows are locked (`FOR UPDATE`) while the order is read
 * and rewritten, so two admins reordering the same product at once are
 * serialised instead of interleaving their writes. (An image *added* during the
 * reorder isn't blocked by the lock — it's simply picked up by whichever
 * reorder runs next; a tie in `sort_order` is harmless, every reader copes.)
 *
 * What the final order is, and what's rejected (stale screen, foreign id,
 * duplicates), is decided by the pure `planImageOrder`.
 */
export async function applyProductImageOrder(
  tx: Tx,
  productId: string,
  requestedIds: string[],
): Promise<{ id: string; sortOrder: number }[]> {
  const rows = await tx
    .select({ id: productImages.id })
    .from(productImages)
    .where(eq(productImages.productId, productId))
    .orderBy(asc(productImages.sortOrder), asc(productImages.id))
    .for("update");

  const ordered = planImageOrder(
    rows.map((r) => r.id),
    requestedIds,
  );

  for (let i = 0; i < ordered.length; i++) {
    await tx
      .update(productImages)
      .set({ sortOrder: i })
      .where(
        and(eq(productImages.id, ordered[i]), eq(productImages.productId, productId)),
      );
  }

  return ordered.map((id, sortOrder) => ({ id, sortOrder }));
}
