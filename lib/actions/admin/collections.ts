"use server";

import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { requireAdmin } from "@/lib/actions/auth";
import { ActionError } from "@/lib/action-error";
import { logAdminAction } from "@/lib/audit/log-admin-action";

const { collections, collectionProducts, products, productImages } = schema;

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
  if (!normalized) throw new ActionError("Collection slug is required");
  if (!SLUG_PATTERN.test(normalized)) {
    throw new ActionError("Slug must be lowercase letters, numbers, and hyphens only");
  }
  if (normalized.length > 160) throw new ActionError("Slug is too long (max 160 chars)");
  return normalized;
}

function revalidateCollectionConsumers(slug?: string) {
  revalidatePath("/", "layout");
  revalidatePath("/collections");
  if (slug) revalidatePath(`/collections/${slug}`);
  revalidatePath("/studio/collections");
}

// ── Read ─────────────────────────────────────────────────────────────────────

export async function getAdminCollections() {
  await requireAdmin();

  const rows = await db
    .select({
      id: collections.id,
      name: collections.name,
      slug: collections.slug,
      description: collections.description,
      heroImageUrl: collections.heroImageUrl,
      isActive: collections.isActive,
      isHomepageFeature: collections.isHomepageFeature,
      sortOrder: collections.sortOrder,
      createdAt: collections.createdAt,
      productCount: sql<number>`count(${collectionProducts.productId})::int`.as(
        "product_count",
      ),
    })
    .from(collections)
    .leftJoin(
      collectionProducts,
      eq(collectionProducts.collectionId, collections.id),
    )
    .groupBy(collections.id)
    .orderBy(asc(collections.sortOrder));

  return rows;
}

export async function getAdminCollectionDetail(id: string) {
  await requireAdmin();

  const collection = await db
    .select()
    .from(collections)
    .where(eq(collections.id, id))
    .limit(1)
    .then((rows) => rows[0] ?? null);
  if (!collection) return null;

  const memberRows = await db
    .select({
      productId: products.id,
      title: products.title,
      slug: products.slug,
      basePrice: products.basePrice,
      status: products.status,
      sortOrder: collectionProducts.sortOrder,
    })
    .from(collectionProducts)
    .innerJoin(products, eq(products.id, collectionProducts.productId))
    .where(eq(collectionProducts.collectionId, id))
    .orderBy(asc(collectionProducts.sortOrder));

  // First product image per member, for the admin table thumbnails
  const productIds = memberRows.map((m) => m.productId);
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

  const members = memberRows.map((m) => ({
    ...m,
    imageUrl: imageByProduct.get(m.productId) ?? null,
  }));

  return { ...collection, products: members };
}

// ── Mutate ───────────────────────────────────────────────────────────────────

export interface CreateCollectionInput {
  name: string;
  slug: string;
  description?: string;
  heroImageUrl?: string;
  isActive?: boolean;
  sortOrder?: number;
}

export async function createCollection(input: CreateCollectionInput) {
  const admin = await requireAdmin();

  const name = input.name.trim();
  if (!name) throw new ActionError("Collection name is required");
  const slug = validateSlug(input.slug);

  // Slug uniqueness
  const existing = await db
    .select({ id: collections.id })
    .from(collections)
    .where(eq(collections.slug, slug))
    .limit(1);
  if (existing[0]) throw new ActionError(`Slug "${slug}" is already taken`);

  const nextSort =
    input.sortOrder ??
    ((
      await db
        .select({ max: sql<number>`coalesce(max(${collections.sortOrder}), 0) + 1` })
        .from(collections)
    )[0]?.max ?? 1);

  const [created] = await db
    .insert(collections)
    .values({
      name,
      slug,
      description: input.description?.trim() || null,
      heroImageUrl: input.heroImageUrl?.trim() || null,
      isActive: input.isActive ?? true,
      sortOrder: nextSort,
    })
    .returning();

  revalidateCollectionConsumers(slug);
  await logAdminAction(admin.id, "collection.create", "collection", created.id, {
    name: created.name,
  });
  return created;
}

export interface UpdateCollectionInput {
  name?: string;
  slug?: string;
  description?: string | null;
  heroImageUrl?: string | null;
  isActive?: boolean;
  sortOrder?: number;
}

export async function updateCollection(
  id: string,
  input: UpdateCollectionInput,
) {
  const admin = await requireAdmin();

  const existing = await db
    .select()
    .from(collections)
    .where(eq(collections.id, id))
    .limit(1);
  if (!existing[0]) throw new ActionError("Collection not found");

  const patch: Partial<typeof collections.$inferInsert> = {};

  if (input.name !== undefined) {
    const trimmed = input.name.trim();
    if (!trimmed) throw new ActionError("Collection name cannot be empty");
    patch.name = trimmed;
  }

  if (input.slug !== undefined) {
    const newSlug = validateSlug(input.slug);
    if (newSlug !== existing[0].slug) {
      const collision = await db
        .select({ id: collections.id })
        .from(collections)
        .where(eq(collections.slug, newSlug))
        .limit(1);
      if (collision[0]) throw new ActionError(`Slug "${newSlug}" is already taken`);
    }
    patch.slug = newSlug;
  }

  if (input.description !== undefined) patch.description = input.description;
  if (input.heroImageUrl !== undefined) patch.heroImageUrl = input.heroImageUrl;
  if (input.isActive !== undefined) patch.isActive = input.isActive;
  if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder;

  if (Object.keys(patch).length === 0) return existing[0];

  const [updated] = await db
    .update(collections)
    .set(patch)
    .where(eq(collections.id, id))
    .returning();

  revalidateCollectionConsumers(updated.slug);
  await logAdminAction(admin.id, "collection.update", "collection", id, {
    changes: input,
  });
  return updated;
}

/**
 * Sets (or clears) whether a collection is the one featured on the homepage.
 * At most one collection can be featured — turning this on for one
 * atomically turns it off for any other (also enforced by a partial unique
 * index at the DB level as a backstop). Turning it off with no other
 * collection featured reverts the homepage to its randomised-arrivals
 * fallback.
 */
export async function setHomepageFeatureCollection(
  id: string,
  featured: boolean,
): Promise<{ ok: true }> {
  const admin = await requireAdmin();

  const existing = await db
    .select({ id: collections.id })
    .from(collections)
    .where(eq(collections.id, id))
    .limit(1);
  if (!existing[0]) throw new ActionError("Collection not found");

  if (featured) {
    await db.transaction(async (tx) => {
      await tx
        .update(collections)
        .set({ isHomepageFeature: false })
        .where(eq(collections.isHomepageFeature, true));
      await tx
        .update(collections)
        .set({ isHomepageFeature: true })
        .where(eq(collections.id, id));
    });
  } else {
    await db
      .update(collections)
      .set({ isHomepageFeature: false })
      .where(eq(collections.id, id));
  }

  revalidateCollectionConsumers();
  await logAdminAction(admin.id, "collection.set_homepage_feature", "collection", id, {
    featured,
  });
  return { ok: true };
}

export async function deleteCollection(id: string): Promise<{ ok: true }> {
  const admin = await requireAdmin();

  const existing = await db
    .select({ slug: collections.slug })
    .from(collections)
    .where(eq(collections.id, id))
    .limit(1);
  if (!existing[0]) throw new ActionError("Collection not found");

  // collection_products cascade-deletes via FK ON DELETE CASCADE
  await db.delete(collections).where(eq(collections.id, id));

  revalidateCollectionConsumers(existing[0].slug);
  await logAdminAction(admin.id, "collection.delete", "collection", id);
  return { ok: true };
}

// ── Membership ───────────────────────────────────────────────────────────────

export async function addProductsToCollection(
  collectionId: string,
  productIds: string[],
): Promise<{ added: number }> {
  const admin = await requireAdmin();
  if (productIds.length === 0) return { added: 0 };

  const collection = await db
    .select({ slug: collections.slug })
    .from(collections)
    .where(eq(collections.id, collectionId))
    .limit(1);
  if (!collection[0]) throw new ActionError("Collection not found");

  // Find the current max sortOrder so new items go to the end
  const current = await db
    .select({ max: sql<number>`coalesce(max(${collectionProducts.sortOrder}), -1)` })
    .from(collectionProducts)
    .where(eq(collectionProducts.collectionId, collectionId));
  let nextSort = (current[0]?.max ?? -1) + 1;

  const rows = productIds.map((productId) => ({
    collectionId,
    productId,
    sortOrder: nextSort++,
  }));

  await db.insert(collectionProducts).values(rows).onConflictDoNothing();

  revalidateCollectionConsumers(collection[0].slug);
  await logAdminAction(admin.id, "collection.add_products", "collection", collectionId, {
    productIds,
  });
  return { added: productIds.length };
}

export async function removeProductsFromCollection(
  collectionId: string,
  productIds: string[],
): Promise<{ removed: number }> {
  const admin = await requireAdmin();
  if (productIds.length === 0) return { removed: 0 };

  const collection = await db
    .select({ slug: collections.slug })
    .from(collections)
    .where(eq(collections.id, collectionId))
    .limit(1);
  if (!collection[0]) throw new ActionError("Collection not found");

  await db
    .delete(collectionProducts)
    .where(
      and(
        eq(collectionProducts.collectionId, collectionId),
        inArray(collectionProducts.productId, productIds),
      ),
    );

  revalidateCollectionConsumers(collection[0].slug);
  await logAdminAction(admin.id, "collection.remove_products", "collection", collectionId, {
    productIds,
  });
  return { removed: productIds.length };
}

export async function reorderProductsInCollection(
  collectionId: string,
  items: { productId: string; sortOrder: number }[],
): Promise<{ ok: true }> {
  const admin = await requireAdmin();
  if (items.length === 0) return { ok: true };

  const collection = await db
    .select({ slug: collections.slug })
    .from(collections)
    .where(eq(collections.id, collectionId))
    .limit(1);
  if (!collection[0]) throw new ActionError("Collection not found");

  await db.transaction(async (tx) => {
    for (const item of items) {
      await tx
        .update(collectionProducts)
        .set({ sortOrder: item.sortOrder })
        .where(
          and(
            eq(collectionProducts.collectionId, collectionId),
            eq(collectionProducts.productId, item.productId),
          ),
        );
    }
  });

  revalidateCollectionConsumers(collection[0].slug);
  await logAdminAction(admin.id, "collection.reorder_products", "collection", collectionId, {
    items,
  });
  return { ok: true };
}
