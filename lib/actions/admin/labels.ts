"use server";

import { asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireAdmin } from "@/lib/actions/auth";
import { generateCode128Png } from "@/lib/labels/barcode";
import { generateHangTagPdf, type HangTagData } from "@/lib/labels/generate";

const { products, productVariants } = schema;

// ── Public actions ───────────────────────────────────────────────────────────

/**
 * Generates a PDF buffer with one hang tag per variant of the given product.
 * Use when the admin clicks "Print Tags" on a product detail page.
 */
export async function generateHangTagsForProduct(productId: string): Promise<Buffer> {
  await requireAdmin();

  const product = await db
    .select()
    .from(products)
    .where(eq(products.id, productId))
    .limit(1)
    .then((rows) => rows[0] ?? null);
  if (!product) throw new Error("Product not found");

  const variants = await db
    .select()
    .from(productVariants)
    .where(eq(productVariants.productId, productId))
    .orderBy(asc(productVariants.size));
  if (variants.length === 0) {
    throw new Error("This product has no variants — add at least one variant before printing tags.");
  }

  const tags = await Promise.all(
    variants.map<Promise<HangTagData>>(async (v) => ({
      productTitle: product.title,
      size: v.size,
      color: v.color,
      sku: v.sku,
      mrp: product.mrp,
      fabric: product.fabric,
      careInstructions: product.washCare,
      barcodePng: await generateCode128Png(v.sku),
    })),
  );

  return generateHangTagPdf(tags);
}

export interface HangTagPrintItem {
  variantId: string;
  /** How many copies of this one tag to print. Clamped to [1, 100]. */
  quantity: number;
}

const MAX_COPIES_PER_TAG = 100;

/**
 * Generates a PDF buffer with a caller-chosen number of copies per variant.
 * Use when the admin selects specific variants and quantities — either from
 * a product's own tag list, or from a cross-product barcode-scan reprint
 * queue (a damaged tag can belong to any product, not just the one open).
 */
export async function generateHangTagsForVariants(
  items: HangTagPrintItem[],
): Promise<Buffer> {
  await requireAdmin();
  if (items.length === 0) throw new Error("Pick at least one variant");

  const variantIds = items.map((i) => i.variantId);

  const variants = await db
    .select({
      variantId: productVariants.id,
      size: productVariants.size,
      color: productVariants.color,
      sku: productVariants.sku,
      productId: products.id,
      productTitle: products.title,
      mrp: products.mrp,
      fabric: products.fabric,
      washCare: products.washCare,
    })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(inArray(productVariants.id, variantIds));

  if (variants.length === 0) throw new Error("No variants matched the provided ids");

  // Preserve the order the caller passed in
  const byId = new Map(variants.map((v) => [v.variantId, v]));

  const tags: HangTagData[] = [];
  for (const item of items) {
    const v = byId.get(item.variantId);
    if (!v) continue;
    const copies = Math.max(
      1,
      Math.min(MAX_COPIES_PER_TAG, Math.floor(item.quantity) || 1),
    );
    const barcodePng = await generateCode128Png(v.sku);
    for (let i = 0; i < copies; i++) {
      tags.push({
        productTitle: v.productTitle,
        size: v.size,
        color: v.color,
        sku: v.sku,
        mrp: v.mrp,
        fabric: v.fabric,
        careInstructions: v.washCare,
        barcodePng,
      });
    }
  }

  if (tags.length === 0) throw new Error("No matching variants to print");

  return generateHangTagPdf(tags);
}
