"use server";

import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { requireAdmin } from "@/lib/actions/auth";
import { ActionError } from "@/lib/action-error";

const { homepageVideoSlots } = schema;

export type HomepageVideoSlot = typeof homepageVideoSlots.$inferSelect;
export type HomepageVideoPosition = "left" | "right";

function revalidateHomepageVideoConsumers() {
  revalidatePath("/", "layout");
  revalidatePath("/studio/homepage-videos");
}

function validateUrl(input: string, label: string): string {
  const trimmed = input.trim();
  if (trimmed.length > 2000) throw new ActionError(`${label} is too long`);
  if (!/^https?:\/\//.test(trimmed) && !trimmed.startsWith("/")) {
    throw new ActionError(`${label} must be an absolute URL or start with /`);
  }
  return trimmed;
}

export async function getAdminHomepageVideoSlots(): Promise<{
  left: HomepageVideoSlot | null;
  right: HomepageVideoSlot | null;
}> {
  await requireAdmin();
  const rows = await db.select().from(homepageVideoSlots);
  return {
    left: rows.find((r) => r.position === "left") ?? null,
    right: rows.find((r) => r.position === "right") ?? null,
  };
}

export interface UpsertHomepageVideoSlotInput {
  videoUrl?: string;
  title?: string;
  subtitle?: string;
  ctaLabel?: string;
  ctaHref?: string;
  isActive?: boolean;
}

export async function upsertHomepageVideoSlot(
  position: HomepageVideoPosition,
  input: UpsertHomepageVideoSlotInput,
): Promise<HomepageVideoSlot> {
  await requireAdmin();

  const videoUrl = input.videoUrl?.trim()
    ? validateUrl(input.videoUrl, "Video URL")
    : null;
  const ctaHref = input.ctaHref?.trim()
    ? validateUrl(input.ctaHref, "CTA link")
    : null;

  const values = {
    position,
    videoUrl,
    title: input.title?.trim() || null,
    subtitle: input.subtitle?.trim() || null,
    ctaLabel: input.ctaLabel?.trim() || null,
    ctaHref,
    isActive: input.isActive ?? true,
    updatedAt: new Date(),
  };

  const [row] = await db
    .insert(homepageVideoSlots)
    .values(values)
    .onConflictDoUpdate({
      target: homepageVideoSlots.position,
      set: values,
    })
    .returning();

  revalidateHomepageVideoConsumers();
  return row;
}
