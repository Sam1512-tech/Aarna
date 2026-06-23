"use server";

import { and, asc, desc, eq, gte, lte, ne, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
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

export interface ProductListResult {
  items: Product[];
  total: number;
  page: number;
  pageSize: number;
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
        items: items.map((r) => r.p),
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
    items,
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

  const [variants, images, category] = await Promise.all([
    db
      .select()
      .from(productVariants)
      .where(eq(productVariants.productId, product.id))
      .orderBy(asc(productVariants.size)),
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

  return { ...product, variants, images, category };
}

export async function getNewArrivals(limit = 8): Promise<Product[]> {
  return db
    .select()
    .from(products)
    .where(eq(products.status, "active"))
    .orderBy(desc(products.createdAt))
    .limit(limit);
}

export async function getRelatedProducts(
  productId: string,
  limit = 4,
): Promise<Product[]> {
  const current = await db
    .select({ categoryId: products.categoryId })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);

  const categoryId = current[0]?.categoryId;
  if (!categoryId) return [];

  return db
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
}
