"use server";

import type {
  Category,
  Collection,
  Product,
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

export async function getProducts(
  _filters: ProductFilters = {},
): Promise<ProductListResult> {
  // TODO(backend): query products with joins on variants/images, apply filters + sort + pagination.
  return { items: [], total: 0, page: 1, pageSize: 24 };
}

export async function getProductBySlug(
  _slug: string,
): Promise<ProductWithVariants | null> {
  // TODO(backend): join product + variants + images + category.
  return null;
}

export async function getCategories(): Promise<Category[]> {
  // TODO(backend): fetch all categories ordered by sortOrder.
  return [];
}

export async function getCollections(): Promise<Collection[]> {
  // TODO(backend): fetch active collections ordered by sortOrder.
  return [];
}

export async function getNewArrivals(_limit = 8): Promise<Product[]> {
  // TODO(backend): top N active products by createdAt desc.
  return [];
}

export async function getRelatedProducts(
  _productId: string,
  _limit = 4,
): Promise<Product[]> {
  // TODO(backend): same category, exclude self.
  return [];
}
