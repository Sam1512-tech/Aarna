"use server";

import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { requireAdmin } from "@/lib/actions/auth";

const { reviews, products, customers } = schema;

type ReviewStatus = "pending" | "approved" | "rejected";

function revalidateReviewConsumers(productSlug?: string) {
  revalidatePath("/admin/reviews");
  if (productSlug) revalidatePath(`/product/${productSlug}`);
}

// ── Read ─────────────────────────────────────────────────────────────────────

export interface AdminReviewFilters {
  status?: ReviewStatus;
  productId?: string;
  customerId?: string;
  minRating?: number;
  maxRating?: number;
  page?: number;
  pageSize?: number;
}

export async function getAdminReviews(filters: AdminReviewFilters = {}) {
  await requireAdmin();

  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.max(1, Math.min(100, filters.pageSize ?? 50));
  const offset = (page - 1) * pageSize;

  const conditions = [];
  if (filters.status) conditions.push(eq(reviews.status, filters.status));
  if (filters.productId) conditions.push(eq(reviews.productId, filters.productId));
  if (filters.customerId) conditions.push(eq(reviews.customerId, filters.customerId));
  if (filters.minRating !== undefined) conditions.push(gte(reviews.rating, filters.minRating));
  if (filters.maxRating !== undefined) conditions.push(lte(reviews.rating, filters.maxRating));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [items, totalRows] = await Promise.all([
    db
      .select({
        id: reviews.id,
        rating: reviews.rating,
        body: reviews.body,
        status: reviews.status,
        createdAt: reviews.createdAt,
        productId: reviews.productId,
        productTitle: products.title,
        productSlug: products.slug,
        customerId: reviews.customerId,
        customerName: customers.fullName,
        customerEmail: customers.email,
      })
      .from(reviews)
      .innerJoin(products, eq(products.id, reviews.productId))
      .innerJoin(customers, eq(customers.id, reviews.customerId))
      .where(whereClause)
      .orderBy(desc(reviews.createdAt))
      .limit(pageSize)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(reviews)
      .where(whereClause),
  ]);

  return { items, total: totalRows[0]?.count ?? 0, page, pageSize };
}

export async function getAdminReviewDetail(id: string) {
  await requireAdmin();

  const row = await db
    .select({
      id: reviews.id,
      rating: reviews.rating,
      body: reviews.body,
      status: reviews.status,
      createdAt: reviews.createdAt,
      productId: reviews.productId,
      productTitle: products.title,
      productSlug: products.slug,
      customerId: reviews.customerId,
      customerName: customers.fullName,
      customerEmail: customers.email,
    })
    .from(reviews)
    .innerJoin(products, eq(products.id, reviews.productId))
    .innerJoin(customers, eq(customers.id, reviews.customerId))
    .where(eq(reviews.id, id))
    .limit(1);
  return row[0] ?? null;
}

export async function getReviewModerationCounts() {
  await requireAdmin();

  const rows = await db
    .select({
      status: reviews.status,
      count: sql<number>`count(*)::int`,
    })
    .from(reviews)
    .groupBy(reviews.status);

  const counts: Record<ReviewStatus, number> = {
    pending: 0,
    approved: 0,
    rejected: 0,
  };
  for (const row of rows) {
    counts[row.status] = row.count;
  }
  return counts;
}

// ── Mutate ───────────────────────────────────────────────────────────────────

export async function updateReviewStatus(id: string, status: ReviewStatus) {
  await requireAdmin();

  const existing = await db
    .select({ productId: reviews.productId })
    .from(reviews)
    .where(eq(reviews.id, id))
    .limit(1);
  if (!existing[0]) throw new Error("Review not found");

  const [updated] = await db
    .update(reviews)
    .set({ status })
    .where(eq(reviews.id, id))
    .returning();

  const product = await db
    .select({ slug: products.slug })
    .from(products)
    .where(eq(products.id, existing[0].productId))
    .limit(1);

  revalidateReviewConsumers(product[0]?.slug);
  return updated;
}

export async function bulkUpdateReviewStatus(
  ids: string[],
  status: ReviewStatus,
): Promise<{ updated: number }> {
  await requireAdmin();
  if (ids.length === 0) return { updated: 0 };

  // Pull affected product slugs first so we can revalidate every product page
  const affected = await db
    .select({ productId: reviews.productId })
    .from(reviews)
    .where(inArray(reviews.id, ids));

  await db.update(reviews).set({ status }).where(inArray(reviews.id, ids));

  const productIds = [...new Set(affected.map((r) => r.productId))];
  const affectedSlugs =
    productIds.length > 0
      ? await db
          .select({ slug: products.slug })
          .from(products)
          .where(inArray(products.id, productIds))
      : [];

  revalidatePath("/admin/reviews");
  for (const { slug } of affectedSlugs) {
    revalidatePath(`/product/${slug}`);
  }

  return { updated: ids.length };
}

export async function deleteReview(id: string): Promise<{ ok: true }> {
  await requireAdmin();

  const existing = await db
    .select({ productId: reviews.productId })
    .from(reviews)
    .where(eq(reviews.id, id))
    .limit(1);
  if (!existing[0]) throw new Error("Review not found");

  await db.delete(reviews).where(eq(reviews.id, id));

  const product = await db
    .select({ slug: products.slug })
    .from(products)
    .where(eq(products.id, existing[0].productId))
    .limit(1);

  revalidateReviewConsumers(product[0]?.slug);
  return { ok: true };
}
