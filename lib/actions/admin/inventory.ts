"use server";

import { and, asc, desc, eq, gt, ilike, inArray, lte, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { requireAdmin } from "@/lib/actions/auth";

const { productVariants, products, inventoryMovements, productImages } = schema;

type MovementReason = "purchase" | "sale" | "return" | "adjustment" | "manual";

const DEFAULT_LOW_STOCK_THRESHOLD = 5;

// ── Read ─────────────────────────────────────────────────────────────────────

export interface InventoryFilters {
  search?: string; // matches variant SKU or product title
  categoryId?: string;
  onlyLowStock?: boolean;
  onlyOutOfStock?: boolean;
  lowStockThreshold?: number;
  page?: number;
  pageSize?: number;
}

export interface InventoryRow {
  variantId: string;
  productId: string;
  productTitle: string;
  productSlug: string;
  size: string | null;
  color: string | null;
  sku: string;
  price: number;
  stock: number;
  isActive: boolean;
  imageUrl: string | null;
}

export interface InventoryListResult {
  items: InventoryRow[];
  total: number;
  page: number;
  pageSize: number;
  lowStockThreshold: number;
}

export async function getInventory(
  filters: InventoryFilters = {},
): Promise<InventoryListResult> {
  await requireAdmin();

  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.max(1, Math.min(200, filters.pageSize ?? 50));
  const offset = (page - 1) * pageSize;
  const threshold = filters.lowStockThreshold ?? DEFAULT_LOW_STOCK_THRESHOLD;

  const conditions = [];

  if (filters.search?.trim()) {
    const q = `%${filters.search.trim()}%`;
    conditions.push(or(ilike(productVariants.sku, q), ilike(products.title, q))!);
  }
  if (filters.categoryId) {
    conditions.push(eq(products.categoryId, filters.categoryId));
  }
  if (filters.onlyOutOfStock) {
    conditions.push(eq(productVariants.stock, 0));
  } else if (filters.onlyLowStock) {
    conditions.push(lte(productVariants.stock, threshold));
    conditions.push(gt(productVariants.stock, 0));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, totalRows] = await Promise.all([
    db
      .select({
        variantId: productVariants.id,
        productId: products.id,
        productTitle: products.title,
        productSlug: products.slug,
        size: productVariants.size,
        color: productVariants.color,
        sku: productVariants.sku,
        price: productVariants.price,
        stock: productVariants.stock,
        isActive: productVariants.isActive,
      })
      .from(productVariants)
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(whereClause)
      .orderBy(asc(productVariants.stock), asc(products.title))
      .limit(pageSize)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(productVariants)
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(whereClause),
  ]);

  // Attach the first image per product so the admin can visually identify rows
  const productIds = [...new Set(rows.map((r) => r.productId))];
  const imageRows =
    productIds.length > 0
      ? await db
          .select({
            productId: productImages.productId,
            url: productImages.url,
            sortOrder: productImages.sortOrder,
          })
          .from(productImages)
          .where(inArray(productImages.productId, productIds))
      : [];

  const imageByProduct = new Map<string, string>();
  for (const img of imageRows.sort((a, b) => a.sortOrder - b.sortOrder)) {
    if (!imageByProduct.has(img.productId)) {
      imageByProduct.set(img.productId, img.url);
    }
  }

  const items: InventoryRow[] = rows.map((r) => ({
    ...r,
    imageUrl: imageByProduct.get(r.productId) ?? null,
  }));

  return {
    items,
    total: totalRows[0]?.count ?? 0,
    page,
    pageSize,
    lowStockThreshold: threshold,
  };
}

export interface VariantLookup {
  variantId: string;
  productId: string;
  productTitle: string;
  size: string | null;
  color: string | null;
  sku: string;
  stock: number;
}

/**
 * Exact-match SKU lookup for barcode-scan workflows (e.g. the reprint-tag
 * queue) — a scanner types the exact SKU + Enter, so this doesn't need the
 * fuzzy ilike matching getInventory's search does.
 */
export async function getVariantBySku(sku: string): Promise<VariantLookup | null> {
  await requireAdmin();

  const trimmed = sku.trim();
  if (!trimmed) return null;

  const rows = await db
    .select({
      variantId: productVariants.id,
      productId: products.id,
      productTitle: products.title,
      size: productVariants.size,
      color: productVariants.color,
      sku: productVariants.sku,
      stock: productVariants.stock,
    })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(eq(productVariants.sku, trimmed))
    .limit(1);

  return rows[0] ?? null;
}

export async function getLowStockVariants(
  threshold: number = DEFAULT_LOW_STOCK_THRESHOLD,
): Promise<InventoryRow[]> {
  await requireAdmin();

  const result = await getInventory({
    onlyLowStock: true,
    lowStockThreshold: threshold,
    pageSize: 200,
  });
  return result.items;
}

// ── Mutate ───────────────────────────────────────────────────────────────────

export interface AdjustStockInput {
  variantId: string;
  delta: number; // positive = restock, negative = remove
  reason: MovementReason;
  referenceId?: string; // e.g., purchase order number, return id, or order number
  note?: string;
}

export async function adjustStock(input: AdjustStockInput) {
  await requireAdmin();

  if (!Number.isInteger(input.delta) || input.delta === 0) {
    throw new Error("Delta must be a non-zero integer");
  }

  // Atomic update + audit log inside one transaction
  return db.transaction(async (tx) => {
    const variant = await tx
      .select({ id: productVariants.id, stock: productVariants.stock, sku: productVariants.sku })
      .from(productVariants)
      .where(eq(productVariants.id, input.variantId))
      .limit(1);

    if (!variant[0]) throw new Error("Variant not found");

    const newStock = variant[0].stock + input.delta;
    if (newStock < 0) {
      throw new Error(
        `Cannot reduce stock below 0 (current: ${variant[0].stock}, delta: ${input.delta})`,
      );
    }

    await tx
      .update(productVariants)
      .set({ stock: newStock })
      .where(eq(productVariants.id, input.variantId));

    await tx.insert(inventoryMovements).values({
      variantId: input.variantId,
      delta: input.delta,
      reason: input.reason,
      referenceId: input.referenceId ?? null,
      note: input.note ?? null,
    });

    revalidatePath("/admin/inventory");
    revalidatePath("/admin/products");
    return { variantId: input.variantId, previousStock: variant[0].stock, newStock };
  });
}

/**
 * Apply many stock adjustments atomically (e.g., from a bulk restock CSV).
 * Either all rows succeed or none — protects against partial uploads.
 */
export async function bulkAdjustStock(
  items: AdjustStockInput[],
): Promise<{ adjusted: number }> {
  await requireAdmin();
  if (items.length === 0) return { adjusted: 0 };

  await db.transaction(async (tx) => {
    for (const item of items) {
      if (!Number.isInteger(item.delta) || item.delta === 0) {
        throw new Error(`Invalid delta for variant ${item.variantId}`);
      }

      const variant = await tx
        .select({ stock: productVariants.stock })
        .from(productVariants)
        .where(eq(productVariants.id, item.variantId))
        .limit(1);
      if (!variant[0]) throw new Error(`Variant ${item.variantId} not found`);

      const newStock = variant[0].stock + item.delta;
      if (newStock < 0) {
        throw new Error(
          `Cannot reduce stock below 0 for variant ${item.variantId}`,
        );
      }

      await tx
        .update(productVariants)
        .set({ stock: newStock })
        .where(eq(productVariants.id, item.variantId));

      await tx.insert(inventoryMovements).values({
        variantId: item.variantId,
        delta: item.delta,
        reason: item.reason,
        referenceId: item.referenceId ?? null,
        note: item.note ?? null,
      });
    }
  });

  revalidatePath("/admin/inventory");
  revalidatePath("/admin/products");
  return { adjusted: items.length };
}

// ── Audit log ────────────────────────────────────────────────────────────────

export interface MovementsFilters {
  variantId?: string;
  reason?: MovementReason;
  page?: number;
  pageSize?: number;
}

export async function getInventoryMovements(filters: MovementsFilters = {}) {
  await requireAdmin();

  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.max(1, Math.min(200, filters.pageSize ?? 50));
  const offset = (page - 1) * pageSize;

  const conditions = [];
  if (filters.variantId) conditions.push(eq(inventoryMovements.variantId, filters.variantId));
  if (filters.reason) conditions.push(eq(inventoryMovements.reason, filters.reason));
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select({
      id: inventoryMovements.id,
      variantId: inventoryMovements.variantId,
      delta: inventoryMovements.delta,
      reason: inventoryMovements.reason,
      referenceId: inventoryMovements.referenceId,
      note: inventoryMovements.note,
      createdAt: inventoryMovements.createdAt,
      sku: productVariants.sku,
      size: productVariants.size,
      color: productVariants.color,
      productTitle: products.title,
    })
    .from(inventoryMovements)
    .innerJoin(productVariants, eq(productVariants.id, inventoryMovements.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(whereClause)
    .orderBy(desc(inventoryMovements.createdAt))
    .limit(pageSize)
    .offset(offset);

  return rows;
}
