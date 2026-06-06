"use server";

import { and, asc, eq, isNull, lte, or, gte } from "drizzle-orm";
import { db, schema } from "@/lib/db";

const { banners } = schema;

export type Banner = typeof banners.$inferSelect;

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
