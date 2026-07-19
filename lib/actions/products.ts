"use server";

import { and, asc, desc, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { isVideoUrl } from "@/lib/media";
import { sortBySize } from "@/lib/sizes";
import type {
  Category,
  Collection,
  Product,
  ProductWithVariants,
} from "@/lib/types";

const {
  categories,
  collections,
  products,
  productVariants,
  productImages,
  collectionProducts,
} = schema;

export interface ProductFilters {
  category?: string;
  collection?: string;
  minPrice?: number;
  maxPrice?: number;
  size?: string;
  color?: string;
  sort?: "newest" | "price_asc" | "price_desc";
  page?: number;
  pageSize?: number;
}

export interface CardImage {
  url: string;
  altText: string | null;
}

/** Product row + the image its listing card should show (first non-video). */
export type CardProduct = Product & { image: CardImage | null };

export interface ProductListResult {
  items: CardProduct[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Batch-attaches each product's card image: lowest sortOrder wins, but a
 * video only stands in until any real image exists for that product.
 */
async function attachCardImages(items: Product[]): Promise<CardProduct[]> {
  if (items.length === 0) return [];

  const rows = await db
    .select()
    .from(productImages)
    .where(
      inArray(
        productImages.productId,
        items.map((p) => p.id),
      ),
    )
    .orderBy(asc(productImages.sortOrder));

  const byProduct = new Map<string, CardImage>();
  for (const row of rows) {
    const existing = byProduct.get(row.productId);
    if (!existing || (isVideoUrl(existing.url) && !isVideoUrl(row.url))) {
      byProduct.set(row.productId, { url: row.url, altText: row.altText });
    }
  }

  return items.map((p) => ({ ...p, image: byProduct.get(p.id) ?? null }));
}

/**
 * One default variant id per product (first in-stock in garment-size order,
 * falling back to the first variant if every size is out of stock). For
 * listing surfaces that quick-add without a full PDP size/color picker (e.g.
 * search results) — not meant for anywhere a customer should choose a size.
 */
export async function getDefaultVariantsForProducts(
  productIds: string[],
): Promise<Map<string, string>> {
  if (productIds.length === 0) return new Map();

  const rows = await db
    .select({
      productId: productVariants.productId,
      id: productVariants.id,
      size: productVariants.size,
      stock: productVariants.stock,
    })
    .from(productVariants)
    .where(
      and(
        inArray(productVariants.productId, productIds),
        eq(productVariants.isActive, true),
      ),
    );

  const byProduct = new Map<string, typeof rows>();
  for (const row of rows) {
    if (!byProduct.has(row.productId)) byProduct.set(row.productId, []);
    byProduct.get(row.productId)!.push(row);
  }

  const result = new Map<string, string>();
  for (const [productId, variants] of byProduct) {
    const sorted = sortBySize(variants);
    const pick = sorted.find((v) => v.stock > 0) ?? sorted[0];
    if (pick) result.set(productId, pick.id);
  }
  return result;
}

// ── Categories ───────────────────────────────────────────────────────────────

export async function getCategories(): Promise<Category[]> {
  return db.select().from(categories).orderBy(asc(categories.sortOrder));
}

// ── Collections ──────────────────────────────────────────────────────────────

export async function getCollections(): Promise<Collection[]> {
  return db
    .select()
    .from(collections)
    .where(eq(collections.isActive, true))
    .orderBy(asc(collections.sortOrder));
}

export async function getCollectionBySlug(
  slug: string,
): Promise<Collection | null> {
  const [row] = await db
    .select()
    .from(collections)
    .where(and(eq(collections.slug, slug), eq(collections.isActive, true)))
    .limit(1);
  return row ?? null;
}

export interface HomepageFeature {
  collection: Collection;
  products: CardProduct[];
}

/**
 * The admin-picked "show this on the homepage" collection, with its products
 * ready to render. Returns null when no collection is currently featured —
 * the homepage falls back to its randomised new-arrivals shuffle in that
 * case, so this is always safe to call.
 */
export async function getHomepageFeaturedCollection(
  limit = 4,
): Promise<HomepageFeature | null> {
  const [collection] = await db
    .select()
    .from(collections)
    .where(
      and(eq(collections.isHomepageFeature, true), eq(collections.isActive, true)),
    )
    .limit(1);
  if (!collection) return null;

  const items = await db
    .select({ p: products })
    .from(products)
    .innerJoin(collectionProducts, eq(collectionProducts.productId, products.id))
    .where(
      and(
        eq(collectionProducts.collectionId, collection.id),
        eq(products.status, "active"),
      ),
    )
    .orderBy(desc(products.createdAt))
    .limit(limit);

  return {
    collection,
    products: await attachCardImages(items.map((r) => r.p)),
  };
}

// ── Products ─────────────────────────────────────────────────────────────────

export async function getProducts(
  filters: ProductFilters = {},
): Promise<ProductListResult> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.max(1, Math.min(60, filters.pageSize ?? 24));
  const offset = (page - 1) * pageSize;

  const conditions = [eq(products.status, "active")];

  if (filters.category) {
    // category arg is a slug — resolve to id
    const cat = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.slug, filters.category))
      .limit(1);
    if (cat[0]) conditions.push(eq(products.categoryId, cat[0].id));
  }

  if (filters.minPrice !== undefined) {
    conditions.push(gte(products.basePrice, filters.minPrice));
  }
  if (filters.maxPrice !== undefined) {
    conditions.push(lte(products.basePrice, filters.maxPrice));
  }

  const orderBy =
    filters.sort === "price_asc"
      ? asc(products.basePrice)
      : filters.sort === "price_desc"
      ? desc(products.basePrice)
      : desc(products.createdAt);

  const whereClause = and(...conditions);

  const query = db.select().from(products).where(whereClause);

  // Filter by collection via join (slug → collection_products → products)
  if (filters.collection) {
    const col = await db
      .select({ id: collections.id })
      .from(collections)
      .where(eq(collections.slug, filters.collection))
      .limit(1);
    if (col[0]) {
      const items = await db
        .select({ p: products })
        .from(products)
        .innerJoin(
          collectionProducts,
          eq(collectionProducts.productId, products.id),
        )
        .where(
          and(whereClause, eq(collectionProducts.collectionId, col[0].id)),
        )
        .orderBy(orderBy)
        .limit(pageSize)
        .offset(offset);

      const totalRows = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(products)
        .innerJoin(
          collectionProducts,
          eq(collectionProducts.productId, products.id),
        )
        .where(
          and(whereClause, eq(collectionProducts.collectionId, col[0].id)),
        );

      return {
        items: await attachCardImages(items.map((r) => r.p)),
        total: totalRows[0]?.count ?? 0,
        page,
        pageSize,
      };
    }
  }

  const items = await query.orderBy(orderBy).limit(pageSize).offset(offset);

  const totalRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(products)
    .where(whereClause);

  return {
    items: await attachCardImages(items),
    total: totalRows[0]?.count ?? 0,
    page,
    pageSize,
  };
}

export async function getProductBySlug(
  slug: string,
): Promise<ProductWithVariants | null> {
  const product = await db
    .select()
    .from(products)
    .where(eq(products.slug, slug))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!product) return null;

  const [variantRows, images, category] = await Promise.all([
    db
      .select()
      .from(productVariants)
      .where(eq(productVariants.productId, product.id))
      .orderBy(asc(productVariants.createdAt)),
    db
      .select()
      .from(productImages)
      .where(eq(productImages.productId, product.id)),
    product.categoryId
      ? db
          .select()
          .from(categories)
          .where(eq(categories.id, product.categoryId))
          .limit(1)
          .then((rows) => rows[0] ?? null)
      : Promise.resolve(null),
  ]);

  // Garment size order (XS, S, M, L, XL, XXL), not the alphabetical order a
  // plain DB sort on the "size" column gives (which puts L before S).
  const variants = sortBySize(variantRows);

  return { ...product, variants, images, category };
}

export interface VariantOption {
  variantId: string;
  size: string | null;
  color: string | null;
  sku: string;
  stock: number;
  isCurrentVariant: boolean;
}

/**
 * Feeds ExchangeVariantChooser — every active variant of a product, in
 * garment size order, with `isCurrentVariant` flagging the one the customer
 * already has (the component grays it out rather than excluding it, so it's
 * included here too).
 */
export async function getVariantsInStockForProduct(
  productId: string,
  currentVariantId?: string,
): Promise<VariantOption[]> {
  const rows = await db
    .select()
    .from(productVariants)
    .where(
      and(
        eq(productVariants.productId, productId),
        eq(productVariants.isActive, true),
      ),
    );

  return sortBySize(rows).map((v) => ({
    variantId: v.id,
    size: v.size,
    color: v.color,
    sku: v.sku,
    stock: v.stock,
    isCurrentVariant: v.id === currentVariantId,
  }));
}

export interface NewArrivalsOptions {
  limit?: number;
  /** Exclude products with no in-stock active variant — keeps randomised
   * homepage picks (e.g. the featured-collection shuffle) from ever landing
   * on something the customer can't actually buy. */
  inStockOnly?: boolean;
}

export async function getNewArrivals(
  options: NewArrivalsOptions = {},
): Promise<CardProduct[]> {
  const { limit = 8, inStockOnly = false } = options;

  const conditions = [eq(products.status, "active")];
  if (inStockOnly) {
    conditions.push(
      sql`exists (
        select 1 from ${productVariants}
        where ${productVariants.productId} = ${products.id}
          and ${productVariants.isActive} = true
          and ${productVariants.stock} > 0
      )`,
    );
  }

  const items = await db
    .select()
    .from(products)
    .where(and(...conditions))
    .orderBy(desc(products.createdAt))
    .limit(limit);
  return attachCardImages(items);
}

export async function getRelatedProducts(
  productId: string,
  limit = 4,
): Promise<CardProduct[]> {
  const current = await db
    .select({ categoryId: products.categoryId })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);

  const categoryId = current[0]?.categoryId;
  if (!categoryId) return [];

  const items = await db
    .select()
    .from(products)
    .where(
      and(
        eq(products.status, "active"),
        eq(products.categoryId, categoryId),
        ne(products.id, productId),
      ),
    )
    .orderBy(desc(products.createdAt))
    .limit(limit);
  return attachCardImages(items);
}
