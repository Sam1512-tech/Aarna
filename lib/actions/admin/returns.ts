"use server";

import { and, desc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { requireAdmin } from "@/lib/actions/auth";
import {
  notifyWhatsApp,
  firstNameFromAddress,
  rupees,
} from "@/lib/whatsapp/notify";

const { returns, orderItems, orders } = schema;

const RETURN_STATUSES = [
  "requested",
  "approved",
  "rejected",
  "picked",
  "received",
  "refunded",
] as const;
type ReturnStatus = (typeof RETURN_STATUSES)[number];

// ── Read ─────────────────────────────────────────────────────────────────────

export interface AdminReturnFilters {
  status?: ReturnStatus;
  page?: number;
  pageSize?: number;
}

export async function getAdminReturns(filters: AdminReturnFilters = {}) {
  await requireAdmin();

  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.max(1, Math.min(100, filters.pageSize ?? 50));
  const offset = (page - 1) * pageSize;

  const conditions = [];
  if (filters.status) conditions.push(eq(returns.status, filters.status));
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [items, totalRows] = await Promise.all([
    db
      .select({
        id: returns.id,
        status: returns.status,
        reason: returns.reason,
        reasonCategory: returns.reasonCategory,
        refundAmount: returns.refundAmount,
        createdAt: returns.createdAt,
        resolvedAt: returns.resolvedAt,
        orderId: orders.id,
        orderNumber: orders.orderNumber,
        productTitle: orderItems.productTitleSnapshot,
        variantLabel: orderItems.variantLabelSnapshot,
        sku: orderItems.skuSnapshot,
        lineTotal: orderItems.lineTotal,
      })
      .from(returns)
      .innerJoin(orderItems, eq(orderItems.id, returns.orderItemId))
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(whereClause)
      .orderBy(desc(returns.createdAt))
      .limit(pageSize)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(returns)
      .where(whereClause),
  ]);

  return { items, total: totalRows[0]?.count ?? 0, page, pageSize };
}

// ── Mutate ───────────────────────────────────────────────────────────────────

export async function updateReturnStatus(returnId: string, status: ReturnStatus) {
  await requireAdmin();

  if (!RETURN_STATUSES.includes(status)) {
    throw new Error(`Invalid return status: ${status}`);
  }

  // Pull the return + its order (for the WhatsApp + refund-amount basis).
  const [row] = await db
    .select({
      refundAmount: returns.refundAmount,
      lineTotal: orderItems.lineTotal,
      orderId: orders.id,
      orderNumber: orders.orderNumber,
      phone: orders.phone,
      whatsappOptIn: orders.whatsappOptIn,
      shippingAddress: orders.shippingAddress,
    })
    .from(returns)
    .innerJoin(orderItems, eq(orderItems.id, returns.orderItemId))
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(eq(returns.id, returnId))
    .limit(1);
  if (!row) throw new Error("Return not found");

  // "refunded" is set by the Razorpay refund.processed webhook; "rejected" ends
  // the flow here. Both resolve the return.
  const resolved = status === "rejected" || status === "refunded";
  const [updated] = await db
    .update(returns)
    .set({ status, ...(resolved ? { resolvedAt: new Date() } : {}) })
    .where(eq(returns.id, returnId))
    .returning();

  revalidatePath("/admin/returns");

  if (status === "received") {
    // Refund amount may not be set yet — fall back to the returned item's total.
    const refundBasis = row.refundAmount ?? row.lineTotal;
    await notifyWhatsApp({
      orderId: row.orderId,
      phone: row.phone,
      whatsappOptIn: row.whatsappOptIn,
      templateKey: "return_received",
      bodyValues: [
        firstNameFromAddress(row.shippingAddress),
        row.orderNumber,
        rupees(refundBasis),
      ],
    });
  }

  return updated;
}
