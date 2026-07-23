"use server";

import { and, desc, eq, ilike, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { requireAdmin } from "@/lib/actions/auth";
import { ActionError } from "@/lib/action-error";
import { logAdminAction } from "@/lib/audit/log-admin-action";

const { coupons, orders } = schema;

export type Coupon = typeof coupons.$inferSelect;

type CouponType = "flat" | "percent";

const CODE_PATTERN = /^[A-Z0-9_-]+$/;

function normalizeCode(input: string): string {
  return input.trim().toUpperCase();
}

function validateCode(input: string): string {
  const normalized = normalizeCode(input);
  if (!normalized) throw new ActionError("Coupon code is required");
  if (normalized.length > 40) throw new ActionError("Coupon code is too long (max 40 chars)");
  if (!CODE_PATTERN.test(normalized)) {
    throw new ActionError("Coupon code can only contain letters, numbers, _ and -");
  }
  return normalized;
}

function validateValue(type: CouponType, value: number): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new ActionError("Coupon value must be a positive integer");
  }
  if (type === "percent" && value > 100) {
    throw new ActionError("Percent coupon cannot exceed 100");
  }
  // For "flat", value is in paise — no upper bound enforced server-side
  return value;
}

// ── Read ─────────────────────────────────────────────────────────────────────

export interface AdminCouponFilters {
  search?: string;
  onlyActive?: boolean;
  onlyExpired?: boolean;
  page?: number;
  pageSize?: number;
}

export async function getAdminCoupons(filters: AdminCouponFilters = {}) {
  await requireAdmin();

  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.max(1, Math.min(100, filters.pageSize ?? 50));
  const offset = (page - 1) * pageSize;

  const conditions = [];
  if (filters.search?.trim()) {
    conditions.push(ilike(coupons.code, `%${filters.search.trim().toUpperCase()}%`));
  }
  if (filters.onlyActive) conditions.push(eq(coupons.isActive, true));
  if (filters.onlyExpired) {
    conditions.push(sql`${coupons.expiresAt} IS NOT NULL AND ${coupons.expiresAt} < now()`);
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [items, totalRows] = await Promise.all([
    db
      .select()
      .from(coupons)
      .where(whereClause)
      .orderBy(desc(coupons.createdAt))
      .limit(pageSize)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(coupons)
      .where(whereClause),
  ]);

  return { items, total: totalRows[0]?.count ?? 0, page, pageSize };
}

export async function getAdminCouponDetail(id: string) {
  await requireAdmin();
  const rows = await db.select().from(coupons).where(eq(coupons.id, id)).limit(1);
  return rows[0] ?? null;
}

// ── Mutate ───────────────────────────────────────────────────────────────────

export interface CreateCouponInput {
  code: string;
  type: CouponType;
  /** For "flat": amount in paise. For "percent": 1-100. */
  value: number;
  minOrderAmount?: number;
  usageLimit?: number | null;
  perCustomerLimit?: number;
  expiresAt?: Date | null;
  isActive?: boolean;
}

export async function createCoupon(input: CreateCouponInput) {
  const admin = await requireAdmin();

  const code = validateCode(input.code);
  const value = validateValue(input.type, input.value);

  const minOrder = input.minOrderAmount ?? 0;
  if (!Number.isInteger(minOrder) || minOrder < 0) {
    throw new ActionError("Minimum order amount must be a non-negative integer");
  }

  if (input.usageLimit !== undefined && input.usageLimit !== null) {
    if (!Number.isInteger(input.usageLimit) || input.usageLimit <= 0) {
      throw new ActionError("Usage limit must be a positive integer or null");
    }
  }

  const perCustomer = input.perCustomerLimit ?? 1;
  if (!Number.isInteger(perCustomer) || perCustomer < 1) {
    throw new ActionError("Per-customer limit must be at least 1");
  }

  if (input.expiresAt && input.expiresAt.getTime() <= Date.now()) {
    throw new ActionError("Expiry date must be in the future");
  }

  // Code uniqueness
  const existing = await db
    .select({ id: coupons.id })
    .from(coupons)
    .where(eq(coupons.code, code))
    .limit(1);
  if (existing[0]) throw new ActionError(`Coupon "${code}" already exists`);

  const [created] = await db
    .insert(coupons)
    .values({
      code,
      type: input.type,
      value,
      minOrderAmount: minOrder,
      usageLimit: input.usageLimit ?? null,
      perCustomerLimit: perCustomer,
      expiresAt: input.expiresAt ?? null,
      isActive: input.isActive ?? true,
    })
    .returning();

  await logAdminAction(admin.id, "coupon.create", "coupon", created.id, { code: created.code });

  revalidatePath("/studio/coupons");
  return created;
}

export interface UpdateCouponInput {
  code?: string;
  type?: CouponType;
  value?: number;
  minOrderAmount?: number;
  usageLimit?: number | null;
  perCustomerLimit?: number;
  expiresAt?: Date | null;
  isActive?: boolean;
}

export async function updateCoupon(id: string, input: UpdateCouponInput) {
  const admin = await requireAdmin();

  const existing = await db
    .select()
    .from(coupons)
    .where(eq(coupons.id, id))
    .limit(1);
  if (!existing[0]) throw new ActionError("Coupon not found");

  const patch: Partial<typeof coupons.$inferInsert> = {};

  if (input.code !== undefined) {
    const newCode = validateCode(input.code);
    if (newCode !== existing[0].code) {
      const collision = await db
        .select({ id: coupons.id })
        .from(coupons)
        .where(eq(coupons.code, newCode))
        .limit(1);
      if (collision[0]) throw new ActionError(`Coupon "${newCode}" already exists`);
    }
    patch.code = newCode;
  }

  // Re-validate value against the effective type (new or existing)
  const effectiveType = input.type ?? existing[0].type;
  if (input.type !== undefined) patch.type = input.type;
  if (input.value !== undefined) {
    patch.value = validateValue(effectiveType, input.value);
  } else if (input.type !== undefined && existing[0].type !== input.type) {
    // Type changed but value didn't — re-validate existing value against new type
    validateValue(input.type, existing[0].value);
  }

  if (input.minOrderAmount !== undefined) {
    if (!Number.isInteger(input.minOrderAmount) || input.minOrderAmount < 0) {
      throw new ActionError("Minimum order amount must be a non-negative integer");
    }
    patch.minOrderAmount = input.minOrderAmount;
  }

  if (input.usageLimit !== undefined) {
    if (input.usageLimit !== null) {
      if (!Number.isInteger(input.usageLimit) || input.usageLimit <= 0) {
        throw new ActionError("Usage limit must be a positive integer or null");
      }
      if (input.usageLimit < existing[0].usedCount) {
        throw new ActionError(
          `Usage limit (${input.usageLimit}) cannot be lower than already-used count (${existing[0].usedCount})`,
        );
      }
    }
    patch.usageLimit = input.usageLimit;
  }

  if (input.perCustomerLimit !== undefined) {
    if (!Number.isInteger(input.perCustomerLimit) || input.perCustomerLimit < 1) {
      throw new ActionError("Per-customer limit must be at least 1");
    }
    patch.perCustomerLimit = input.perCustomerLimit;
  }

  if (input.expiresAt !== undefined) patch.expiresAt = input.expiresAt;
  if (input.isActive !== undefined) patch.isActive = input.isActive;

  if (Object.keys(patch).length === 0) return existing[0];

  const [updated] = await db
    .update(coupons)
    .set(patch)
    .where(eq(coupons.id, id))
    .returning();

  await logAdminAction(admin.id, "coupon.update", "coupon", id, { changes: input });

  revalidatePath("/studio/coupons");
  return updated;
}

export async function deleteCoupon(id: string): Promise<{ ok: true }> {
  const admin = await requireAdmin();

  const existing = await db
    .select({ usedCount: coupons.usedCount, code: coupons.code })
    .from(coupons)
    .where(eq(coupons.id, id))
    .limit(1);
  if (!existing[0]) throw new ActionError("Coupon not found");

  // If the coupon has been used, deactivate instead of delete — preserves
  // the historical reference on the orders.couponCode column.
  if (existing[0].usedCount > 0) {
    throw new ActionError(
      `Cannot delete "${existing[0].code}" — already used ${existing[0].usedCount} time(s). Deactivate it instead.`,
    );
  }

  // usedCount alone isn't enough anymore: it's only incremented once payment
  // is actually confirmed (see incrementCouponUsage in lib/db/queries/orders.ts),
  // so an order can be sitting mid-checkout with this code snapshotted onto
  // orders.couponCode while usedCount is still 0. Deleting the coupon out from
  // under it wouldn't break that order (couponCode is a plain snapshot, not a
  // foreign key) but would orphan the reference — nothing could look the code
  // back up. Check for any referencing order directly instead of trusting
  // usedCount to have caught it.
  const [referencingOrder] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.couponCode, existing[0].code))
    .limit(1);
  if (referencingOrder) {
    throw new ActionError(
      `Cannot delete "${existing[0].code}" — an order already references it. Deactivate it instead.`,
    );
  }

  await db.delete(coupons).where(eq(coupons.id, id));

  await logAdminAction(admin.id, "coupon.delete", "coupon", id);

  revalidatePath("/studio/coupons");
  return { ok: true };
}
