"use server";

import { asc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { requireAdmin } from "@/lib/actions/auth";
import type { Category } from "@/lib/types";
import { ActionError } from "@/lib/action-error";

const { categories, products } = schema;

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function normalizeSlug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function validateName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new ActionError("Category name is required");
  if (trimmed.length > 120) throw new ActionError("Category name is too long (max 120 chars)");
  return trimmed;
}

function validateSlug(slug: string): string {
  const normalized = normalizeSlug(slug);
  if (!normalized) throw new ActionError("Category slug is required");
  if (!SLUG_PATTERN.test(normalized)) {
    throw new ActionError("Slug must be lowercase letters, numbers, and hyphens only");
  }
  if (normalized.length > 140) throw new ActionError("Category slug is too long (max 140 chars)");
  return normalized;
}

/**
 * Triggers a re-render of every page that displays category data so admin
 * changes appear instantly on the storefront.
 */
function revalidateCategoryConsumers() {
  revalidatePath("/", "layout"); // navbar (in root layout) + homepage
  revalidatePath("/shop", "layout"); // PLP shell
  revalidatePath("/admin/categories");
}

// ── Public actions ───────────────────────────────────────────────────────────

export async function getAdminCategories(): Promise<Category[]> {
  await requireAdmin();
  return db.select().from(categories).orderBy(asc(categories.sortOrder));
}

export async function getAdminCategory(id: string): Promise<Category | null> {
  await requireAdmin();
  const rows = await db
    .select()
    .from(categories)
    .where(eq(categories.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export interface CreateCategoryInput {
  name: string;
  slug: string;
  sortOrder?: number;
  parentId?: string;
  imageUrl?: string | null;
  imageMobileUrl?: string | null;
}

export async function createCategory(input: CreateCategoryInput): Promise<Category> {
  await requireAdmin();

  const name = validateName(input.name);
  const slug = validateSlug(input.slug);

  // Check slug uniqueness
  const existing = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.slug, slug))
    .limit(1);
  if (existing[0]) throw new ActionError(`Slug "${slug}" is already taken`);

  // If sortOrder isn't provided, append to the end
  const nextSort =
    input.sortOrder ??
    ((
      await db
        .select({ max: sql<number>`coalesce(max(${categories.sortOrder}), 0) + 1` })
        .from(categories)
    )[0]?.max ?? 1);

  const [created] = await db
    .insert(categories)
    .values({
      name,
      slug,
      sortOrder: nextSort,
      parentId: input.parentId ?? null,
      imageUrl: input.imageUrl ?? null,
      imageMobileUrl: input.imageMobileUrl ?? null,
    })
    .returning();

  revalidateCategoryConsumers();
  return created;
}

export interface UpdateCategoryInput {
  name?: string;
  slug?: string;
  sortOrder?: number;
  parentId?: string | null;
  imageUrl?: string | null;
  imageMobileUrl?: string | null;
}

export async function updateCategory(
  id: string,
  input: UpdateCategoryInput,
): Promise<Category> {
  await requireAdmin();

  const existing = await db
    .select()
    .from(categories)
    .where(eq(categories.id, id))
    .limit(1);
  if (!existing[0]) throw new ActionError("Category not found");

  const patch: Partial<typeof categories.$inferInsert> = {};

  if (input.name !== undefined) patch.name = validateName(input.name);

  if (input.slug !== undefined) {
    const newSlug = validateSlug(input.slug);
    if (newSlug !== existing[0].slug) {
      const collision = await db
        .select({ id: categories.id })
        .from(categories)
        .where(eq(categories.slug, newSlug))
        .limit(1);
      if (collision[0]) throw new ActionError(`Slug "${newSlug}" is already taken`);
    }
    patch.slug = newSlug;
  }

  if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder;
  if (input.parentId !== undefined) patch.parentId = input.parentId;
  if (input.imageUrl !== undefined) patch.imageUrl = input.imageUrl;
  if (input.imageMobileUrl !== undefined) {
    patch.imageMobileUrl = input.imageMobileUrl;
  }

  if (Object.keys(patch).length === 0) return existing[0];

  const [updated] = await db
    .update(categories)
    .set(patch)
    .where(eq(categories.id, id))
    .returning();

  revalidateCategoryConsumers();
  return updated;
}

export async function deleteCategory(id: string): Promise<{ ok: true }> {
  await requireAdmin();

  // Block deletion if any products reference this category — protects against
  // accidental data orphaning. Admin must reassign products first.
  const productCount = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(products)
    .where(eq(products.categoryId, id));

  if ((productCount[0]?.count ?? 0) > 0) {
    throw new ActionError(
      `Cannot delete: ${productCount[0].count} product(s) still in this category. Reassign them first.`,
    );
  }

  // Block deletion if any other categories reference this as parent
  const childCount = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(categories)
    .where(eq(categories.parentId, id));

  if ((childCount[0]?.count ?? 0) > 0) {
    throw new ActionError(
      `Cannot delete: ${childCount[0].count} sub-categor${
        childCount[0].count === 1 ? "y" : "ies"
      } still reference this. Reparent or delete them first.`,
    );
  }

  await db.delete(categories).where(eq(categories.id, id));

  revalidateCategoryConsumers();
  return { ok: true };
}

/**
 * Bulk reorder — pass an array of { id, sortOrder } pairs. Used by drag-and-drop
 * UIs in admin where the dev wants to commit all positions in one round trip.
 */
export async function reorderCategories(
  items: { id: string; sortOrder: number }[],
): Promise<{ ok: true }> {
  await requireAdmin();
  if (items.length === 0) return { ok: true };

  await db.transaction(async (tx) => {
    for (const item of items) {
      await tx
        .update(categories)
        .set({ sortOrder: item.sortOrder })
        .where(eq(categories.id, item.id));
    }
  });

  revalidateCategoryConsumers();
  return { ok: true };
}
