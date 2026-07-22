"use server";

import { and, desc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { requireAdmin } from "@/lib/actions/auth";
import { ActionError } from "@/lib/action-error";

const { reviews, products, customers } = schema;

type ReviewStatus = "pending" | "approved" | "rejected";

// ── Read ─────────────────────────────────────────────────────────────────────

export interface AdminReviewFilters {
  status?: ReviewStatus;
  productId?: string;
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

/** Count of reviews awaiting moderation — handy for an admin nav badge. */
export async function getPendingReviewCount(): Promise<number> {
  await requireAdmin();
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(reviews)
    .where(eq(reviews.status, "pending"));
  return rows[0]?.count ?? 0;
}

// ── Mutate ───────────────────────────────────────────────────────────────────

const ALLOWED_STATUSES: ReviewStatus[] = ["pending", "approved", "rejected"];

export async function updateReviewStatus(id: string, status: ReviewStatus) {
  await requireAdmin();

  if (!ALLOWED_STATUSES.includes(status)) {
    throw new ActionError(`Invalid review status: ${status}`);
  }

  const existing = await db
    .select({ id: reviews.id, productId: reviews.productId })
    .from(reviews)
    .where(eq(reviews.id, id))
    .limit(1);
  if (!existing[0]) throw new ActionError("Review not found");

  const [updated] = await db
    .update(reviews)
    .set({ status })
    .where(eq(reviews.id, id))
    .returning();

  // Refresh the moderation queue. Approving/rejecting changes what shows on the
  // storefront product page, so refresh that too (path resolved from the slug).
  revalidatePath("/studio/reviews");
  const slug = await db
    .select({ slug: products.slug })
    .from(products)
    .where(eq(products.id, existing[0].productId))
    .limit(1);
  if (slug[0]) revalidatePath(`/products/${slug[0].slug}`);

  return updated;
}

export async function deleteReview(id: string): Promise<{ ok: true }> {
  await requireAdmin();

  const existing = await db
    .select({ id: reviews.id })
    .from(reviews)
    .where(eq(reviews.id, id))
    .limit(1);
  if (!existing[0]) throw new ActionError("Review not found");

  await db.delete(reviews).where(eq(reviews.id, id));
  revalidatePath("/studio/reviews");
  return { ok: true };
}
