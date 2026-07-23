"use server";

import { and, desc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { getCurrentCustomer } from "@/lib/actions/auth";
import { ActionError } from "@/lib/action-error";

const { orders, orderItems, productVariants, products, reviews, customers } =
  schema;

async function requireCustomer() {
  const customer = await getCurrentCustomer();
  if (!customer) throw new ActionError("Unauthorized — please sign in");
  return customer;
}

export interface ReviewableItem {
  orderItemId: string;
  orderNumber: string;
  productTitle: string;
  variantLabel: string | null;
  existingReview: { rating: number; body: string | null } | null;
}

/**
 * Delivered order items the current customer can rate, one per order item —
 * a customer can only review products they've actually received. Each entry
 * carries any existing review for that product so the UI can offer "edit"
 * instead of "write" a review.
 */
export async function getReviewableItems(): Promise<ReviewableItem[]> {
  const customer = await requireCustomer();

  const rows = await db
    .select({
      orderItemId: orderItems.id,
      orderNumber: orders.orderNumber,
      productId: productVariants.productId,
      productTitle: orderItems.productTitleSnapshot,
      variantLabel: orderItems.variantLabelSnapshot,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .innerJoin(productVariants, eq(productVariants.id, orderItems.variantId))
    .where(
      and(
        eq(orders.customerId, customer.id),
        eq(orders.fulfillmentStatus, "delivered"),
      ),
    )
    .orderBy(desc(orders.createdAt));

  if (rows.length === 0) return [];

  const productIds = [...new Set(rows.map((r) => r.productId))];
  const existing = await db
    .select({
      productId: reviews.productId,
      rating: reviews.rating,
      body: reviews.body,
    })
    .from(reviews)
    .where(
      and(
        eq(reviews.customerId, customer.id),
        inArray(reviews.productId, productIds),
      ),
    );
  const byProduct = new Map(
    existing.map((r) => [r.productId, { rating: r.rating, body: r.body }]),
  );

  return rows.map(({ productId, ...r }) => ({
    ...r,
    existingReview: byProduct.get(productId) ?? null,
  }));
}

export interface SubmitReviewInput {
  orderItemId: string;
  rating: number;
  body?: string;
}

/**
 * Creates or updates the customer's review for the product behind this order
 * item. One review per (customer, product) — resubmitting edits the existing
 * row rather than creating a duplicate, and resets it back to "pending" so it
 * goes through moderation again.
 */
export async function submitReview(
  input: SubmitReviewInput,
): Promise<{ ok: true }> {
  const customer = await requireCustomer();

  const rating = Math.round(input.rating);
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    throw new ActionError("Rating must be between 1 and 5 stars");
  }

  const row = await db
    .select({
      customerId: orders.customerId,
      fulfillmentStatus: orders.fulfillmentStatus,
      productId: productVariants.productId,
      productSlug: products.slug,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .innerJoin(productVariants, eq(productVariants.id, orderItems.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(eq(orderItems.id, input.orderItemId))
    .limit(1);

  if (!row[0] || row[0].customerId !== customer.id) {
    throw new ActionError("Order item not found");
  }
  if (row[0].fulfillmentStatus !== "delivered") {
    throw new ActionError("You can review a product once it's delivered");
  }

  const productId = row[0].productId;
  const body = input.body?.trim() || null;

  // Upsert on (product_id, customer_id) — see the unique index in
  // lib/db/schema.ts. A single ON CONFLICT statement instead of a
  // check-then-insert/update means a double-click or flaky-network retry
  // can't create two rows for one customer on one product (which would have
  // double-counted in the average rating); it's also inherently race-free,
  // unlike the two-step read-then-write it replaces.
  await db
    .insert(reviews)
    .values({
      productId,
      customerId: customer.id,
      rating,
      body,
      status: "pending",
    })
    .onConflictDoUpdate({
      target: [reviews.productId, reviews.customerId],
      set: { rating, body, status: "pending" },
    });

  revalidatePath("/account/orders");
  revalidatePath("/studio/reviews");
  // Resubmitting resets status to "pending", which can change what's shown on
  // the PDP (e.g. an approved review's rating/body changing while awaiting
  // re-moderation) — refresh it too. Route is /product/[slug], singular.
  revalidatePath(`/product/${row[0].productSlug}`);
  return { ok: true };
}

// ── Storefront display ───────────────────────────────────────────────────────

export interface DisplayReview {
  id: string;
  rating: number;
  body: string | null;
  customerName: string | null;
  createdAt: Date;
}

export interface ProductReviewSummary {
  average: number;
  count: number;
  reviews: DisplayReview[];
}

/**
 * Approved reviews for a product, public — used on the PDP. Unapproved
 * reviews never leave the admin moderation queue.
 */
export async function getApprovedReviews(
  productId: string,
): Promise<ProductReviewSummary> {
  const rows = await db
    .select({
      id: reviews.id,
      rating: reviews.rating,
      body: reviews.body,
      createdAt: reviews.createdAt,
      customerName: customers.fullName,
    })
    .from(reviews)
    .innerJoin(customers, eq(customers.id, reviews.customerId))
    .where(
      and(eq(reviews.productId, productId), eq(reviews.status, "approved")),
    )
    .orderBy(desc(reviews.createdAt));

  const count = rows.length;
  const average =
    count > 0 ? rows.reduce((sum, r) => sum + r.rating, 0) / count : 0;

  return { average, count, reviews: rows };
}
