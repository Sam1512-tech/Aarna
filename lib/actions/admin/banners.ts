"use server";

import { asc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { requireAdmin } from "@/lib/actions/auth";

const { banners } = schema;

export type Banner = typeof banners.$inferSelect;

function validateUrl(input: string, label: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new Error(`${label} is required`);
  if (trimmed.length > 2000) throw new Error(`${label} is too long`);
  // Accept absolute URLs or app-relative paths (starting with /)
  if (!/^https?:\/\//.test(trimmed) && !trimmed.startsWith("/")) {
    throw new Error(`${label} must be an absolute URL or start with /`);
  }
  return trimmed;
}

function revalidateBannerConsumers() {
  revalidatePath("/", "layout"); // homepage hero
  revalidatePath("/admin/banners");
}

// ── Read ─────────────────────────────────────────────────────────────────────

export async function getAdminBanners(): Promise<Banner[]> {
  await requireAdmin();
  return db.select().from(banners).orderBy(asc(banners.sortOrder));
}

export async function getAdminBannerDetail(id: string): Promise<Banner | null> {
  await requireAdmin();
  const rows = await db.select().from(banners).where(eq(banners.id, id)).limit(1);
  return rows[0] ?? null;
}

// ── Mutate ───────────────────────────────────────────────────────────────────

export interface CreateBannerInput {
  title?: string;
  subtitle?: string;
  imageUrl: string;
  mobileImageUrl?: string;
  ctaLabel?: string;
  ctaHref?: string;
  isActive?: boolean;
  sortOrder?: number;
  startsAt?: Date | null;
  endsAt?: Date | null;
}

export async function createBanner(input: CreateBannerInput): Promise<Banner> {
  await requireAdmin();

  const imageUrl = validateUrl(input.imageUrl, "Image URL");
  const mobileImageUrl = input.mobileImageUrl
    ? validateUrl(input.mobileImageUrl, "Mobile image URL")
    : null;
  const ctaHref = input.ctaHref ? validateUrl(input.ctaHref, "CTA link") : null;

  if (input.startsAt && input.endsAt && input.endsAt <= input.startsAt) {
    throw new Error("End date must be after start date");
  }

  const nextSort =
    input.sortOrder ??
    ((
      await db
        .select({ max: sql<number>`coalesce(max(${banners.sortOrder}), -1) + 1` })
        .from(banners)
    )[0]?.max ?? 0);

  const [created] = await db
    .insert(banners)
    .values({
      title: input.title?.trim() || null,
      subtitle: input.subtitle?.trim() || null,
      imageUrl,
      mobileImageUrl,
      ctaLabel: input.ctaLabel?.trim() || null,
      ctaHref,
      isActive: input.isActive ?? true,
      sortOrder: nextSort,
      startsAt: input.startsAt ?? null,
      endsAt: input.endsAt ?? null,
    })
    .returning();

  revalidateBannerConsumers();
  return created;
}

export interface UpdateBannerInput {
  title?: string | null;
  subtitle?: string | null;
  imageUrl?: string;
  mobileImageUrl?: string | null;
  ctaLabel?: string | null;
  ctaHref?: string | null;
  isActive?: boolean;
  sortOrder?: number;
  startsAt?: Date | null;
  endsAt?: Date | null;
}

export async function updateBanner(
  id: string,
  input: UpdateBannerInput,
): Promise<Banner> {
  await requireAdmin();

  const existing = await db
    .select()
    .from(banners)
    .where(eq(banners.id, id))
    .limit(1);
  if (!existing[0]) throw new Error("Banner not found");

  const patch: Partial<typeof banners.$inferInsert> = { updatedAt: new Date() };

  if (input.title !== undefined) patch.title = input.title;
  if (input.subtitle !== undefined) patch.subtitle = input.subtitle;
  if (input.imageUrl !== undefined) {
    patch.imageUrl = validateUrl(input.imageUrl, "Image URL");
  }
  if (input.mobileImageUrl !== undefined) {
    patch.mobileImageUrl = input.mobileImageUrl
      ? validateUrl(input.mobileImageUrl, "Mobile image URL")
      : null;
  }
  if (input.ctaLabel !== undefined) patch.ctaLabel = input.ctaLabel;
  if (input.ctaHref !== undefined) {
    patch.ctaHref = input.ctaHref ? validateUrl(input.ctaHref, "CTA link") : null;
  }
  if (input.isActive !== undefined) patch.isActive = input.isActive;
  if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder;
  if (input.startsAt !== undefined) patch.startsAt = input.startsAt;
  if (input.endsAt !== undefined) patch.endsAt = input.endsAt;

  const finalStartsAt = patch.startsAt === undefined ? existing[0].startsAt : patch.startsAt;
  const finalEndsAt = patch.endsAt === undefined ? existing[0].endsAt : patch.endsAt;
  if (finalStartsAt && finalEndsAt && finalEndsAt <= finalStartsAt) {
    throw new Error("End date must be after start date");
  }

  const [updated] = await db
    .update(banners)
    .set(patch)
    .where(eq(banners.id, id))
    .returning();

  revalidateBannerConsumers();
  return updated;
}

export async function toggleBannerActive(id: string): Promise<Banner> {
  await requireAdmin();
  const existing = await db
    .select({ isActive: banners.isActive })
    .from(banners)
    .where(eq(banners.id, id))
    .limit(1);
  if (!existing[0]) throw new Error("Banner not found");

  const [updated] = await db
    .update(banners)
    .set({ isActive: !existing[0].isActive, updatedAt: new Date() })
    .where(eq(banners.id, id))
    .returning();

  revalidateBannerConsumers();
  return updated;
}

export async function deleteBanner(id: string): Promise<{ ok: true }> {
  await requireAdmin();
  const result = await db
    .delete(banners)
    .where(eq(banners.id, id))
    .returning({ id: banners.id });
  if (!result[0]) throw new Error("Banner not found");

  revalidateBannerConsumers();
  return { ok: true };
}

export async function reorderBanners(
  items: { id: string; sortOrder: number }[],
): Promise<{ ok: true }> {
  await requireAdmin();
  if (items.length === 0) return { ok: true };

  await db.transaction(async (tx) => {
    for (const item of items) {
      await tx
        .update(banners)
        .set({ sortOrder: item.sortOrder })
        .where(eq(banners.id, item.id));
    }
  });

  revalidateBannerConsumers();
  return { ok: true };
}
