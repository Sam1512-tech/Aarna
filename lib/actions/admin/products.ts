"use server";

import { and, asc, desc, eq, ilike, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { requireAdmin } from "@/lib/actions/auth";
import type { Product, ProductWithVariants } from "@/lib/types";
import { ActionError } from "@/lib/action-error";

const {
  products,
  productVariants,
  productImages,
  categories,
  cartItems,
  orderItems,
} = schema;

/**
 * Throws a friendly error if any variant has been ordered — order_items has
 * no cascade on variantId (by design, preserves order history), so a hard
 * delete would otherwise surface as a raw FK-violation error. Stale cart_items
 * referencing these variants are cleared here too: unlike orders, a cart is
 * not a historical record, so it shouldn't block deleting a variant/product.
 */
async function clearCartsAndGuardOrders(variantIds: string[]): Promise<void> {
  if (variantIds.length === 0) return;

  const ordered = await db
    .select({ variantId: orderItems.variantId })
    .from(orderItems)
    .where(inArray(orderItems.variantId, variantIds));
  if (ordered.length > 0) {
    throw new ActionError(
      "Can't delete — this has already been ordered by a customer. Archive it instead to hide it from the storefront while keeping order history intact.",
    );
  }

  await db.delete(cartItems).where(inArray(cartItems.variantId, variantIds));
}

type ProductStatus = "draft" | "active" | "archived";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function normalizeSlug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function validateSlug(slug: string): string {
  const normalized = normalizeSlug(slug);
  if (!normalized) throw new ActionError("Product slug is required");
  if (!SLUG_PATTERN.test(normalized)) {
    throw new ActionError("Slug must be lowercase letters, numbers, and hyphens only");
  }
  if (normalized.length > 220) throw new ActionError("Slug is too long (max 220 chars)");
  return normalized;
}

function validatePrice(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new ActionError(`${label} must be a non-negative integer in paise`);
  }
  return value;
}

function revalidateProductConsumers(slug?: string) {
  revalidatePath("/", "layout");
  revalidatePath("/shop", "layout");
  if (slug) revalidatePath(`/product/${slug}`);
  revalidatePath("/admin/products");
}

// ── Product CRUD ─────────────────────────────────────────────────────────────

export interface AdminProductFilters {
  status?: ProductStatus;
  categoryId?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface AdminProductListResult {
  items: Product[];
  total: number;
  page: number;
  pageSize: number;
}

export async function getAdminProducts(
  filters: AdminProductFilters = {},
): Promise<AdminProductListResult> {
  await requireAdmin();

  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.max(1, Math.min(100, filters.pageSize ?? 24));
  const offset = (page - 1) * pageSize;

  const conditions = [];
  if (filters.status) conditions.push(eq(products.status, filters.status));
  if (filters.categoryId) conditions.push(eq(products.categoryId, filters.categoryId));
  if (filters.search?.trim()) {
    conditions.push(ilike(products.title, `%${filters.search.trim()}%`));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [items, totalRows] = await Promise.all([
    db
      .select()
      .from(products)
      .where(whereClause)
      .orderBy(desc(products.createdAt))
      .limit(pageSize)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(products)
      .where(whereClause),
  ]);

  return { items, total: totalRows[0]?.count ?? 0, page, pageSize };
}

export async function getAdminProductDetail(
  id: string,
): Promise<ProductWithVariants | null> {
  await requireAdmin();

  const product = await db
    .select()
    .from(products)
    .where(eq(products.id, id))
    .limit(1)
    .then((rows) => rows[0] ?? null);
  if (!product) return null;

  const [variants, images, category] = await Promise.all([
    db
      .select()
      .from(productVariants)
      .where(eq(productVariants.productId, id))
      .orderBy(asc(productVariants.size)),
    db
      .select()
      .from(productImages)
      .where(eq(productImages.productId, id))
      .orderBy(asc(productImages.sortOrder)),
    product.categoryId
      ? db
          .select()
          .from(categories)
          .where(eq(categories.id, product.categoryId))
          .limit(1)
          .then((rows) => rows[0] ?? null)
      : Promise.resolve(null),
  ]);

  return { ...product, variants, images, category };
}

export interface CreateProductInput {
  title: string;
  slug: string;
  description?: string;
  fabric?: string;
  washCare?: string;
  basePrice: number; // selling price in paise
  mrp?: number; // MRP in paise (separate from selling price for discounted items)
  categoryId?: string;
  status?: ProductStatus;
}

export async function createProduct(input: CreateProductInput): Promise<Product> {
  await requireAdmin();

  const title = input.title.trim();
  if (!title) throw new ActionError("Product title is required");

  const slug = validateSlug(input.slug);
  const basePrice = validatePrice(input.basePrice, "Selling price");
  const mrp = input.mrp !== undefined ? validatePrice(input.mrp, "MRP") : null;

  if (mrp !== null && mrp < basePrice) {
    throw new ActionError("MRP cannot be lower than the selling price");
  }

  // Slug uniqueness
  const existing = await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.slug, slug))
    .limit(1);
  if (existing[0]) throw new ActionError(`Slug "${slug}" is already taken`);

  const [created] = await db
    .insert(products)
    .values({
      title,
      slug,
      description: input.description?.trim() || null,
      fabric: input.fabric?.trim() || null,
      washCare: input.washCare?.trim() || null,
      basePrice,
      mrp,
      categoryId: input.categoryId ?? null,
      status: input.status ?? "draft",
    })
    .returning();

  revalidateProductConsumers(slug);
  return created;
}

export interface UpdateProductInput {
  title?: string;
  slug?: string;
  description?: string | null;
  fabric?: string | null;
  washCare?: string | null;
  basePrice?: number;
  mrp?: number | null;
  categoryId?: string | null;
  status?: ProductStatus;
}

export async function updateProduct(
  id: string,
  input: UpdateProductInput,
): Promise<Product> {
  await requireAdmin();

  const existing = await db
    .select()
    .from(products)
    .where(eq(products.id, id))
    .limit(1);
  if (!existing[0]) throw new ActionError("Product not found");

  const patch: Partial<typeof products.$inferInsert> = { updatedAt: new Date() };

  if (input.title !== undefined) {
    const trimmed = input.title.trim();
    if (!trimmed) throw new ActionError("Product title cannot be empty");
    patch.title = trimmed;
  }

  if (input.slug !== undefined) {
    const newSlug = validateSlug(input.slug);
    if (newSlug !== existing[0].slug) {
      const collision = await db
        .select({ id: products.id })
        .from(products)
        .where(eq(products.slug, newSlug))
        .limit(1);
      if (collision[0]) throw new ActionError(`Slug "${newSlug}" is already taken`);
    }
    patch.slug = newSlug;
  }

  if (input.description !== undefined) patch.description = input.description;
  if (input.fabric !== undefined) patch.fabric = input.fabric;
  if (input.washCare !== undefined) patch.washCare = input.washCare;

  if (input.basePrice !== undefined) {
    patch.basePrice = validatePrice(input.basePrice, "Selling price");
  }

  if (input.mrp !== undefined) {
    patch.mrp = input.mrp === null ? null : validatePrice(input.mrp, "MRP");
  }

  const finalBase = patch.basePrice ?? existing[0].basePrice;
  const finalMrp = patch.mrp === undefined ? existing[0].mrp : patch.mrp;
  if (finalMrp !== null && finalMrp < finalBase) {
    throw new ActionError("MRP cannot be lower than the selling price");
  }

  if (input.categoryId !== undefined) patch.categoryId = input.categoryId;
  if (input.status !== undefined) patch.status = input.status;

  const [updated] = await db
    .update(products)
    .set(patch)
    .where(eq(products.id, id))
    .returning();

  revalidateProductConsumers(updated.slug);
  return updated;
}

export async function updateProductStatus(
  id: string,
  status: ProductStatus,
): Promise<Product> {
  return updateProduct(id, { status });
}

export async function deleteProduct(id: string): Promise<{ ok: true }> {
  await requireAdmin();

  const existing = await db
    .select({ slug: products.slug })
    .from(products)
    .where(eq(products.id, id))
    .limit(1);
  if (!existing[0]) throw new ActionError("Product not found");

  const variants = await db
    .select({ id: productVariants.id })
    .from(productVariants)
    .where(eq(productVariants.productId, id));
  await clearCartsAndGuardOrders(variants.map((v) => v.id));

  // Variants + images cascade-delete via FK ON DELETE CASCADE in schema
  await db.delete(products).where(eq(products.id, id));

  revalidateProductConsumers(existing[0].slug);
  return { ok: true };
}

// ── Variant CRUD ─────────────────────────────────────────────────────────────

export interface CreateVariantInput {
  size?: string;
  color?: string;
  sku: string;
  price: number;
  stock?: number;
  weightGrams?: number;
}

export async function createVariant(
  productId: string,
  input: CreateVariantInput,
) {
  await requireAdmin();

  const sku = input.sku.trim();
  if (!sku) throw new ActionError("SKU is required");
  const price = validatePrice(input.price, "Variant price");

  // Verify product exists
  const product = await db
    .select({ id: products.id, slug: products.slug })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);
  if (!product[0]) throw new ActionError("Product not found");

  // SKU uniqueness
  const skuClash = await db
    .select({ id: productVariants.id })
    .from(productVariants)
    .where(eq(productVariants.sku, sku))
    .limit(1);
  if (skuClash[0]) throw new ActionError(`SKU "${sku}" is already taken`);

  const [created] = await db
    .insert(productVariants)
    .values({
      productId,
      size: input.size?.trim() || null,
      color: input.color?.trim() || null,
      sku,
      price,
      stock: input.stock ?? 0,
      weightGrams: input.weightGrams ?? null,
    })
    .returning();

  revalidateProductConsumers(product[0].slug);
  return created;
}

export interface UpdateVariantInput {
  size?: string | null;
  color?: string | null;
  sku?: string;
  price?: number;
  stock?: number;
  weightGrams?: number | null;
  isActive?: boolean;
}

export async function updateVariant(
  variantId: string,
  input: UpdateVariantInput,
) {
  await requireAdmin();

  const existing = await db
    .select()
    .from(productVariants)
    .where(eq(productVariants.id, variantId))
    .limit(1);
  if (!existing[0]) throw new ActionError("Variant not found");

  const patch: Partial<typeof productVariants.$inferInsert> = {};
  if (input.size !== undefined) patch.size = input.size;
  if (input.color !== undefined) patch.color = input.color;
  if (input.sku !== undefined) {
    const sku = input.sku.trim();
    if (!sku) throw new ActionError("SKU cannot be empty");
    if (sku !== existing[0].sku) {
      const skuClash = await db
        .select({ id: productVariants.id })
        .from(productVariants)
        .where(eq(productVariants.sku, sku))
        .limit(1);
      if (skuClash[0]) throw new ActionError(`SKU "${sku}" is already taken`);
    }
    patch.sku = sku;
  }
  if (input.price !== undefined) patch.price = validatePrice(input.price, "Variant price");
  if (input.stock !== undefined) patch.stock = Math.max(0, input.stock);
  if (input.weightGrams !== undefined) patch.weightGrams = input.weightGrams;
  if (input.isActive !== undefined) patch.isActive = input.isActive;

  const [updated] = await db
    .update(productVariants)
    .set(patch)
    .where(eq(productVariants.id, variantId))
    .returning();

  const product = await db
    .select({ slug: products.slug })
    .from(products)
    .where(eq(products.id, updated.productId))
    .limit(1);
  revalidateProductConsumers(product[0]?.slug);
  return updated;
}

export async function deleteVariant(variantId: string): Promise<{ ok: true }> {
  await requireAdmin();

  const existing = await db
    .select({ productId: productVariants.productId })
    .from(productVariants)
    .where(eq(productVariants.id, variantId))
    .limit(1);
  if (!existing[0]) throw new ActionError("Variant not found");

  await clearCartsAndGuardOrders([variantId]);

  await db.delete(productVariants).where(eq(productVariants.id, variantId));

  const product = await db
    .select({ slug: products.slug })
    .from(products)
    .where(eq(products.id, existing[0].productId))
    .limit(1);
  revalidateProductConsumers(product[0]?.slug);
  return { ok: true };
}

// ── Image CRUD ───────────────────────────────────────────────────────────────

export interface AddProductImageInput {
  url: string;
  altText?: string;
  variantColor?: string;
  sortOrder?: number;
}

export async function addProductImage(
  productId: string,
  input: AddProductImageInput,
) {
  await requireAdmin();

  if (!input.url.trim()) throw new ActionError("Image URL is required");

  const product = await db
    .select({ slug: products.slug })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);
  if (!product[0]) throw new ActionError("Product not found");

  const nextSort =
    input.sortOrder ??
    ((
      await db
        .select({ max: sql<number>`coalesce(max(${productImages.sortOrder}), -1) + 1` })
        .from(productImages)
        .where(eq(productImages.productId, productId))
    )[0]?.max ?? 0);

  const [created] = await db
    .insert(productImages)
    .values({
      productId,
      url: input.url.trim(),
      altText: input.altText?.trim() || null,
      variantColor: input.variantColor?.trim() || null,
      sortOrder: nextSort,
    })
    .returning();

  revalidateProductConsumers(product[0].slug);
  return created;
}

export async function removeProductImage(imageId: string): Promise<{ ok: true }> {
  await requireAdmin();

  const existing = await db
    .select({ productId: productImages.productId })
    .from(productImages)
    .where(eq(productImages.id, imageId))
    .limit(1);
  if (!existing[0]) throw new ActionError("Image not found");

  await db.delete(productImages).where(eq(productImages.id, imageId));

  const product = await db
    .select({ slug: products.slug })
    .from(products)
    .where(eq(products.id, existing[0].productId))
    .limit(1);
  revalidateProductConsumers(product[0]?.slug);
  return { ok: true };
}

export async function reorderProductImages(
  items: { id: string; sortOrder: number }[],
): Promise<{ ok: true }> {
  await requireAdmin();
  if (items.length === 0) return { ok: true };

  await db.transaction(async (tx) => {
    for (const item of items) {
      await tx
        .update(productImages)
        .set({ sortOrder: item.sortOrder })
        .where(eq(productImages.id, item.id));
    }
  });

  revalidatePath("/admin/products");
  return { ok: true };
}
