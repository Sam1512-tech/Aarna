"use server";

import { createClient } from "@supabase/supabase-js";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  lte,
  ne,
  type SQL,
} from "drizzle-orm";
import {
  categories,
  collectionProducts,
  collections,
  productImages,
  products,
  productVariants,
} from "@/lib/db/schema";
import type {
  Category,
  Collection,
  Product,
  ProductImage,
  ProductVariant,
  ProductWithVariants,
} from "@/lib/types";

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

type DbModule = typeof import("@/lib/db");

function getPagination(filters: ProductFilters) {
  const page = Math.max(filters.page ?? 1, 1);
  const pageSize = Math.min(Math.max(filters.pageSize ?? 24, 1), 60);

  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize,
  };
}

async function getDb(): Promise<DbModule["db"] | null> {
  if (!process.env.DATABASE_URL) return null;

  const { db } = await import("@/lib/db");
  return db;
}

function getSupabaseReadClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) return null;

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function mapCategory(row: Record<string, unknown>): Category {
  return {
    id: String(row.id),
    name: String(row.name),
    slug: String(row.slug),
    parentId: row.parent_id ? String(row.parent_id) : null,
    sortOrder: Number(row.sort_order ?? 0),
    createdAt: new Date(String(row.created_at)),
  };
}

function mapCollection(row: Record<string, unknown>): Collection {
  return {
    id: String(row.id),
    name: String(row.name),
    slug: String(row.slug),
    description: row.description ? String(row.description) : null,
    heroImageUrl: row.hero_image_url ? String(row.hero_image_url) : null,
    isActive: Boolean(row.is_active),
    sortOrder: Number(row.sort_order ?? 0),
    createdAt: new Date(String(row.created_at)),
  };
}

function mapProduct(row: Record<string, unknown>): Product {
  return {
    id: String(row.id),
    title: String(row.title),
    slug: String(row.slug),
    description: row.description ? String(row.description) : null,
    fabric: row.fabric ? String(row.fabric) : null,
    washCare: row.wash_care ? String(row.wash_care) : null,
    basePrice: Number(row.base_price),
    status: row.status as Product["status"],
    categoryId: row.category_id ? String(row.category_id) : null,
    metadata: row.metadata ?? null,
    createdAt: new Date(String(row.created_at)),
    updatedAt: new Date(String(row.updated_at)),
  };
}

function mapVariant(row: Record<string, unknown>): ProductVariant {
  return {
    id: String(row.id),
    productId: String(row.product_id),
    size: row.size ? String(row.size) : null,
    color: row.color ? String(row.color) : null,
    sku: String(row.sku),
    price: Number(row.price),
    stock: Number(row.stock ?? 0),
    weightGrams: row.weight_grams ? Number(row.weight_grams) : null,
    isActive: Boolean(row.is_active),
    createdAt: new Date(String(row.created_at)),
  };
}

function mapImage(row: Record<string, unknown>): ProductImage {
  return {
    id: String(row.id),
    productId: String(row.product_id),
    variantColor: row.variant_color ? String(row.variant_color) : null,
    url: String(row.url),
    altText: row.alt_text ? String(row.alt_text) : null,
    sortOrder: Number(row.sort_order ?? 0),
  };
}

async function getCategoryIdBySlug(slug: string) {
  const db = await getDb();

  if (db) {
    const [category] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.slug, slug))
      .limit(1);

    return category?.id ?? null;
  }

  const supabase = getSupabaseReadClient();
  if (!supabase) return null;

  const { data } = await supabase
    .from("categories")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  return data?.id ?? null;
}

async function getProductIdsByCollectionSlug(slug: string) {
  const db = await getDb();

  if (db) {
    const [collection] = await db
      .select({ id: collections.id })
      .from(collections)
      .where(and(eq(collections.slug, slug), eq(collections.isActive, true)))
      .limit(1);

    if (!collection) return [];

    const rows = await db
      .select({ productId: collectionProducts.productId })
      .from(collectionProducts)
      .where(eq(collectionProducts.collectionId, collection.id))
      .orderBy(asc(collectionProducts.sortOrder));

    return rows.map((row) => row.productId);
  }

  const supabase = getSupabaseReadClient();
  if (!supabase) return [];

  const { data: collection } = await supabase
    .from("collections")
    .select("id")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();

  if (!collection) return [];

  const { data } = await supabase
    .from("collection_products")
    .select("product_id")
    .eq("collection_id", collection.id)
    .order("sort_order", { ascending: true });

  return data?.map((row) => row.product_id) ?? [];
}

async function getProductIdsByVariantFilters(filters: ProductFilters) {
  const db = await getDb();

  if (db) {
    const conditions: SQL[] = [eq(productVariants.isActive, true)];

    if (filters.size) conditions.push(eq(productVariants.size, filters.size));
    if (filters.color) conditions.push(eq(productVariants.color, filters.color));

    const rows = await db
      .select({ productId: productVariants.productId })
      .from(productVariants)
      .where(and(...conditions));

    return [...new Set(rows.map((row) => row.productId))];
  }

  const supabase = getSupabaseReadClient();
  if (!supabase) return [];

  let query = supabase
    .from("product_variants")
    .select("product_id")
    .eq("is_active", true);

  if (filters.size) query = query.eq("size", filters.size);
  if (filters.color) query = query.eq("color", filters.color);

  const { data } = await query;

  return [...new Set(data?.map((row) => row.product_id) ?? [])];
}

export async function getProducts(
  filters: ProductFilters = {},
): Promise<ProductListResult> {
  const { page, pageSize, offset } = getPagination(filters);
  const db = await getDb();

  if (db) {
    const conditions: SQL[] = [eq(products.status, "active")];

    if (filters.category) {
      const categoryId = await getCategoryIdBySlug(filters.category);
      if (!categoryId) return { items: [], total: 0, page, pageSize };
      conditions.push(eq(products.categoryId, categoryId));
    }

    if (filters.collection) {
      const productIds = await getProductIdsByCollectionSlug(filters.collection);
      if (productIds.length === 0) return { items: [], total: 0, page, pageSize };
      conditions.push(inArray(products.id, productIds));
    }

    if (filters.size || filters.color) {
      const productIds = await getProductIdsByVariantFilters(filters);
      if (productIds.length === 0) return { items: [], total: 0, page, pageSize };
      conditions.push(inArray(products.id, productIds));
    }

    if (typeof filters.minPrice === "number") {
      conditions.push(gte(products.basePrice, filters.minPrice));
    }

    if (typeof filters.maxPrice === "number") {
      conditions.push(lte(products.basePrice, filters.maxPrice));
    }

    const where = and(...conditions);
    const orderBy =
      filters.sort === "price_asc"
        ? asc(products.basePrice)
        : filters.sort === "price_desc"
          ? desc(products.basePrice)
          : desc(products.createdAt);

    const [items, totalRows] = await Promise.all([
      db
        .select()
        .from(products)
        .where(where)
        .orderBy(orderBy, desc(products.createdAt))
        .limit(pageSize)
        .offset(offset),
      db.select({ value: count() }).from(products).where(where),
    ]);

    return {
      items,
      total: totalRows[0]?.value ?? 0,
      page,
      pageSize,
    };
  }

  const supabase = getSupabaseReadClient();
  if (!supabase) return { items: [], total: 0, page, pageSize };

  let query = supabase
    .from("products")
    .select("*", { count: "exact" })
    .eq("status", "active");

  if (filters.category) {
    const categoryId = await getCategoryIdBySlug(filters.category);
    if (!categoryId) return { items: [], total: 0, page, pageSize };
    query = query.eq("category_id", categoryId);
  }

  if (filters.collection) {
    const productIds = await getProductIdsByCollectionSlug(filters.collection);
    if (productIds.length === 0) return { items: [], total: 0, page, pageSize };
    query = query.in("id", productIds);
  }

  if (filters.size || filters.color) {
    const productIds = await getProductIdsByVariantFilters(filters);
    if (productIds.length === 0) return { items: [], total: 0, page, pageSize };
    query = query.in("id", productIds);
  }

  if (typeof filters.minPrice === "number") {
    query = query.gte("base_price", filters.minPrice);
  }

  if (typeof filters.maxPrice === "number") {
    query = query.lte("base_price", filters.maxPrice);
  }

  const orderColumn =
    filters.sort === "price_asc" || filters.sort === "price_desc"
      ? "base_price"
      : "created_at";
  const ascending = filters.sort === "price_asc";
  const { data, count: total } = await query
    .order(orderColumn, { ascending })
    .range(offset, offset + pageSize - 1);

  return {
    items: data?.map(mapProduct) ?? [],
    total: total ?? 0,
    page,
    pageSize,
  };
}

export async function getProductBySlug(
  slug: string,
): Promise<ProductWithVariants | null> {
  const db = await getDb();

  if (db) {
    const [product] = await db
      .select()
      .from(products)
      .where(and(eq(products.slug, slug), eq(products.status, "active")))
      .limit(1);

    if (!product) return null;

    const [variants, images, categoryRows] = await Promise.all([
      db
        .select()
        .from(productVariants)
        .where(
          and(
            eq(productVariants.productId, product.id),
            eq(productVariants.isActive, true),
          ),
        )
        .orderBy(asc(productVariants.size), asc(productVariants.color)),
      db
        .select()
        .from(productImages)
        .where(eq(productImages.productId, product.id))
        .orderBy(asc(productImages.sortOrder)),
      product.categoryId
        ? db
            .select()
            .from(categories)
            .where(eq(categories.id, product.categoryId))
            .limit(1)
        : Promise.resolve([] as Category[]),
    ]);

    return {
      ...product,
      variants,
      images,
      category: categoryRows[0] ?? null,
    };
  }

  const supabase = getSupabaseReadClient();
  if (!supabase) return null;

  const { data: productRow } = await supabase
    .from("products")
    .select("*")
    .eq("slug", slug)
    .eq("status", "active")
    .maybeSingle();

  if (!productRow) return null;

  const product = mapProduct(productRow);
  const [variantsResult, imagesResult, categoryResult] = await Promise.all([
    supabase
      .from("product_variants")
      .select("*")
      .eq("product_id", product.id)
      .eq("is_active", true)
      .order("size", { ascending: true })
      .order("color", { ascending: true }),
    supabase
      .from("product_images")
      .select("*")
      .eq("product_id", product.id)
      .order("sort_order", { ascending: true }),
    product.categoryId
      ? supabase
          .from("categories")
          .select("*")
          .eq("id", product.categoryId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return {
    ...product,
    variants: variantsResult.data?.map(mapVariant) ?? [],
    images: imagesResult.data?.map(mapImage) ?? [],
    category: categoryResult.data ? mapCategory(categoryResult.data) : null,
  };
}

export async function getCategories(): Promise<Category[]> {
  const db = await getDb();

  if (db) {
    return db
      .select()
      .from(categories)
      .orderBy(asc(categories.sortOrder), asc(categories.name));
  }

  const supabase = getSupabaseReadClient();
  if (!supabase) return [];

  const { data } = await supabase
    .from("categories")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  return data?.map(mapCategory) ?? [];
}

export async function getCollections(): Promise<Collection[]> {
  const db = await getDb();

  if (db) {
    return db
      .select()
      .from(collections)
      .where(eq(collections.isActive, true))
      .orderBy(asc(collections.sortOrder), asc(collections.name));
  }

  const supabase = getSupabaseReadClient();
  if (!supabase) return [];

  const { data } = await supabase
    .from("collections")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  return data?.map(mapCollection) ?? [];
}

export async function getNewArrivals(limit = 8): Promise<Product[]> {
  const db = await getDb();

  if (db) {
    return db
      .select()
      .from(products)
      .where(eq(products.status, "active"))
      .orderBy(desc(products.createdAt))
      .limit(limit);
  }

  const supabase = getSupabaseReadClient();
  if (!supabase) return [];

  const { data } = await supabase
    .from("products")
    .select("*")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(limit);

  return data?.map(mapProduct) ?? [];
}

export async function getRelatedProducts(
  productId: string,
  limit = 4,
): Promise<Product[]> {
  const db = await getDb();

  if (db) {
    const [product] = await db
      .select({ categoryId: products.categoryId })
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);

    if (!product?.categoryId) return [];

    return db
      .select()
      .from(products)
      .where(
        and(
          eq(products.status, "active"),
          eq(products.categoryId, product.categoryId),
          ne(products.id, productId),
        ),
      )
      .orderBy(desc(products.createdAt))
      .limit(limit);
  }

  const supabase = getSupabaseReadClient();
  if (!supabase) return [];

  const { data: product } = await supabase
    .from("products")
    .select("category_id")
    .eq("id", productId)
    .maybeSingle();

  if (!product?.category_id) return [];

  const { data } = await supabase
    .from("products")
    .select("*")
    .eq("status", "active")
    .eq("category_id", product.category_id)
    .neq("id", productId)
    .order("created_at", { ascending: false })
    .limit(limit);

  return data?.map(mapProduct) ?? [];
}
