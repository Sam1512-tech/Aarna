"use server";

import { and, asc, eq, isNull, lte, or, gte } from "drizzle-orm";
import { db, schema } from "@/lib/db";

const { banners, homepageVideoSlots } = schema;

export type Banner = typeof banners.$inferSelect;

export interface PublicVideoSlot {
  videoUrl: string;
  title: string | null;
  subtitle: string | null;
  ctaLabel: string | null;
  ctaHref: string | null;
}

/**
 * Returns banners that should be shown right now — active, within their
 * scheduled window (or unscheduled), ordered by sortOrder.
 *
 * Storefront calls this from the homepage hero. Admin changes appear instantly
 * because the admin actions revalidate the root layout.
 */
export async function getActiveBanners(): Promise<Banner[]> {
  const now = new Date();
  return db
    .select()
    .from(banners)
    .where(
      and(
        eq(banners.isActive, true),
        or(isNull(banners.startsAt), lte(banners.startsAt, now))!,
        or(isNull(banners.endsAt), gte(banners.endsAt, now))!,
      ),
    )
    .orderBy(asc(banners.sortOrder));
}

/**
 * The two fixed video slots for the "made to live in" homepage section.
 * Returns null for a side that's inactive or has no video set yet, so the
 * frontend can fall back to a placeholder instead of ever showing dead
 * blank space.
 */
export async function getActiveHomepageVideoSlots(): Promise<{
  left: PublicVideoSlot | null;
  right: PublicVideoSlot | null;
}> {
  const rows = await db
    .select()
    .from(homepageVideoSlots)
    .where(eq(homepageVideoSlots.isActive, true));

  const toPublic = (
    row: (typeof rows)[number] | undefined,
  ): PublicVideoSlot | null => {
    if (!row || !row.videoUrl) return null;
    return {
      videoUrl: row.videoUrl,
      title: row.title,
      subtitle: row.subtitle,
      ctaLabel: row.ctaLabel,
      ctaHref: row.ctaHref,
    };
  };

  return {
    left: toPublic(rows.find((r) => r.position === "left")),
    right: toPublic(rows.find((r) => r.position === "right")),
  };
}
