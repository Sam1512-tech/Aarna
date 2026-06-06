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
      sellingPrice: v.price,
      mrp: product.mrp,
      fabric: product.fabric,
      careInstructions: product.washCare,
      barcodePng: await generateCode128Png(v.sku),
    })),
  );

  return generateHangTagPdf(tags);
}

/**
 * Generates a PDF buffer with one hang tag per provided variant id. Use when
 * the admin selects specific variants (e.g., only restocked sizes) rather than
 * printing the whole product.
 */
export async function generateHangTagsForVariants(
  variantIds: string[],
): Promise<Buffer> {
  await requireAdmin();
  if (variantIds.length === 0) throw new Error("Pick at least one variant");

  const variants = await db
    .select({
      variantId: productVariants.id,
      size: productVariants.size,
      color: productVariants.color,
      sku: productVariants.sku,
      price: productVariants.price,
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

  // Preserve the order the caller passed in (drag-and-drop UIs care about this)
  const byId = new Map(variants.map((v) => [v.variantId, v]));
  const ordered = variantIds
    .map((id) => byId.get(id))
    .filter((v): v is NonNullable<typeof v> => Boolean(v));

  const tags = await Promise.all(
    ordered.map<Promise<HangTagData>>(async (v) => ({
      productTitle: v.productTitle,
      size: v.size,
      color: v.color,
      sku: v.sku,
      sellingPrice: v.price,
      mrp: v.mrp,
      fabric: v.fabric,
      careInstructions: v.washCare,
      barcodePng: await generateCode128Png(v.sku),
    })),
  );

  return generateHangTagPdf(tags);
}

/**
 * Generates a single hang tag for one variant. Convenience wrapper for
 * "Print this one tag" use cases.
 */
export async function generateHangTagForVariant(variantId: string): Promise<Buffer> {
  return generateHangTagsForVariants([variantId]);
}
