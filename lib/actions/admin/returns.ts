"use server";

import { and, desc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { requireAdmin } from "@/lib/actions/auth";
import { requestReversePickup } from "@/lib/delhivery";
import { createRefund } from "@/lib/razorpay";
import { applyStockMovement } from "@/lib/db/queries/inventory";
import {
  notifyWhatsApp,
  firstNameFromAddress,
  rupees,
} from "@/lib/whatsapp/notify";
import { REJECT_REASONS } from "@/lib/returns/reject-reasons";
import type { AddressInput } from "@/lib/types";
import { ActionError } from "@/lib/action-error";
import { logAdminAction } from "@/lib/audit/log-admin-action";

const { returns, orderItems, orders, productVariants, products } = schema;

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
  type?: "return" | "exchange";
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
  if (filters.type) conditions.push(eq(returns.type, filters.type));
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [items, totalRows] = await Promise.all([
    db
      .select({
        id: returns.id,
        status: returns.status,
        type: returns.type,
        reason: returns.reason,
        reasonCategory: returns.reasonCategory,
        refundAmount: returns.refundAmount,
        photos: returns.photos,
        rejectionReason: returns.rejectionReason,
        adminNote: returns.adminNote,
        qcOutcome: returns.qcOutcome,
        createdAt: returns.createdAt,
        resolvedAt: returns.resolvedAt,
        orderId: orders.id,
        orderNumber: orders.orderNumber,
        productTitle: orderItems.productTitleSnapshot,
        variantLabel: orderItems.variantLabelSnapshot,
        sku: orderItems.skuSnapshot,
        lineTotal: orderItems.lineTotal,
        // Exchange target — null for plain returns. Surfaced so an admin
        // can see, at every stage (not just at QC), whether there's
        // actually stock to send before committing to the swap.
        desiredProductTitle: products.title,
        desiredSize: productVariants.size,
        desiredColor: productVariants.color,
        desiredStock: productVariants.stock,
      })
      .from(returns)
      .innerJoin(orderItems, eq(orderItems.id, returns.orderItemId))
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .leftJoin(productVariants, eq(productVariants.id, returns.desiredVariantId))
      .leftJoin(products, eq(products.id, productVariants.productId))
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

export interface UpdateReturnStatusDetails {
  /** Required when status = "rejected". Value from ReturnRejectPicker's
   * REJECT_REASONS (e.g. "window_expired") — not re-validated against that
   * exact list server-side, same trust level as reasonCategory elsewhere in
   * this table. */
  rejectionReason?: string;
  /** Customer-visible explanation — required for rejectionReason "other". */
  adminNote?: string;
}

export async function updateReturnStatus(
  returnId: string,
  status: ReturnStatus,
  details?: UpdateReturnStatusDetails,
) {
  const admin = await requireAdmin();

  if (!RETURN_STATUSES.includes(status)) {
    throw new ActionError(`Invalid return status: ${status}`);
  }
  if (status === "rejected" && !details?.rejectionReason) {
    throw new ActionError("A rejection reason is required");
  }

  // Pull the return + its order (for WhatsApp, refund-amount basis, and the
  // reverse-pickup address).
  const [row] = await db
    .select({
      status: returns.status,
      type: returns.type,
      refundAmount: returns.refundAmount,
      razorpayPaymentId: orders.razorpayPaymentId,
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
  if (!row) throw new ActionError("Return not found");

  // "refunded" is set via markReturnQc (below); "rejected" ends the flow here.
  const resolved = status === "rejected";

  // Booking the reverse pickup on "approved" is best-effort — if Delhivery
  // isn't configured or the call fails, the status change still goes
  // through (same graceful-degradation pattern as notifyWhatsApp below);
  // admin can always coordinate pickup manually.
  let reversePickupAwb: string | undefined;
  if (status === "approved" && row.status !== "approved") {
    try {
      const address = row.shippingAddress as AddressInput;
      const { waybill } = await requestReversePickup({
        orderNumber: row.orderNumber,
        customerName: address.fullName,
        customerAddress: [address.line1, address.line2].filter(Boolean).join(", "),
        customerPincode: address.pincode,
        customerCity: address.city,
        customerState: address.state,
        customerPhone: address.phone,
      });
      reversePickupAwb = waybill;
    } catch (err) {
      console.warn(
        `[returns] reverse pickup booking failed for ${returnId} — needs manual pickup:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  const [updated] = await db
    .update(returns)
    .set({
      status,
      ...(resolved ? { resolvedAt: new Date() } : {}),
      ...(status === "rejected"
        ? {
            rejectionReason: details?.rejectionReason,
            adminNote: details?.adminNote ?? null,
          }
        : {}),
      ...(reversePickupAwb
        ? { delhiveryReversePickupId: reversePickupAwb }
        : {}),
    })
    .where(eq(returns.id, returnId))
    .returning();

  revalidatePath("/studio/returns");
  revalidatePath("/account/returns");

  if (status === "approved" && row.status !== "approved") {
    await notifyWhatsApp({
      orderId: row.orderId,
      phone: row.phone,
      whatsappOptIn: row.whatsappOptIn,
      templateKey: "return_approved",
      bodyValues: [firstNameFromAddress(row.shippingAddress), row.type, row.orderNumber],
    });
  }

  if (status === "rejected" && row.status !== "rejected") {
    const reasonLabel =
      REJECT_REASONS.find((r) => r.value === details?.rejectionReason)?.label ??
      details?.rejectionReason ??
      "Not eligible for return";
    const reasonText = details?.adminNote
      ? `${reasonLabel} — ${details.adminNote}`
      : reasonLabel;
    await notifyWhatsApp({
      orderId: row.orderId,
      phone: row.phone,
      whatsappOptIn: row.whatsappOptIn,
      templateKey: "return_rejected",
      bodyValues: [firstNameFromAddress(row.shippingAddress), row.type, row.orderNumber, reasonText],
    });
  }

  if (status === "received" && row.status !== "received") {
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

  await logAdminAction(admin.id, "return.status_update", "return", returnId, {
    status,
    ...details,
  });

  return updated;
}

export interface MarkReturnQcInput {
  outcome: "pass" | "fail";
  /** % of the stored refund amount to actually refund on a fail. 0-100. */
  partialPercent?: number;
  note?: string;
}

/**
 * Records the inspection outcome once a return/exchange reaches "received"
 * — matches ReturnQcPanel's contract. A pass on a return (or a fail, at
 * whatever percentage) issues an actual Razorpay refund; a pass on an
 * exchange ships the swap instead (refundAmount 0, no Razorpay call) — the
 * account UI already relabels "refunded" as "swap on the way" for
 * exchanges, so no new return_status value is needed for that path.
 */
export async function markReturnQc(returnId: string, input: MarkReturnQcInput) {
  const admin = await requireAdmin();

  if (input.outcome === "fail" && (!input.note || input.note.trim().length < 10)) {
    throw new ActionError("A note (min 10 characters) is required when QC fails");
  }
  if (
    input.partialPercent !== undefined &&
    (!Number.isFinite(input.partialPercent) ||
      input.partialPercent < 0 ||
      input.partialPercent > 100)
  ) {
    throw new ActionError("Partial refund percent must be between 0 and 100");
  }

  // The read, the Razorpay refund call, and the status write all happen
  // inside one transaction with the return row locked (SELECT ... FOR
  // UPDATE) — closing a real race where two concurrent QC submissions (an
  // admin double-clicking "Pass" on a slow connection, or two open tabs)
  // could both read status "received" before either write landed, and both
  // call Razorpay's refund endpoint for the same return. A second
  // concurrent call now blocks on the lock until the first transaction
  // commits, then reads status "refunded" and correctly fails the guard
  // below instead of ever reaching Razorpay a second time. This briefly
  // locks the joined order/order-item rows too (FOR UPDATE with a join
  // locks every joined table by default) — acceptable for a low-frequency
  // admin action, not a customer-facing hot path.
  const { row, updated, finalRefund } = await db.transaction(async (tx) => {
    const [r] = await tx
      .select({
        status: returns.status,
        type: returns.type,
        desiredVariantId: returns.desiredVariantId,
        refundAmount: returns.refundAmount,
        lineTotal: orderItems.lineTotal,
        variantId: orderItems.variantId,
        quantity: orderItems.quantity,
        orderId: orders.id,
        orderNumber: orders.orderNumber,
        phone: orders.phone,
        whatsappOptIn: orders.whatsappOptIn,
        shippingAddress: orders.shippingAddress,
        razorpayPaymentId: orders.razorpayPaymentId,
      })
      .from(returns)
      .innerJoin(orderItems, eq(orderItems.id, returns.orderItemId))
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(eq(returns.id, returnId))
      .for("update");
    if (!r) throw new ActionError("Return not found");
    if (r.status !== "received") {
      throw new ActionError("QC can only be recorded once the item has been received");
    }

    // An exchange QC pass is the moment we commit to shipping a replacement
    // — re-check the desired variant's stock right now, not just at the
    // original request. The gap between a customer requesting an exchange
    // and QC actually passing (approval + reverse-transit + inspection time)
    // can be days; the desired size can sell out to someone else in that
    // window with nothing flagging it, since outbound swap shipping is
    // still a fully manual step (see the restock comment below). Blocking
    // here — rather than only warning — matches "pass" meaning "the swap
    // ships": QC can still be marked pass once the admin has actually
    // restocked/reserved a replacement, or the admin can fail QC instead.
    if (input.outcome === "pass" && r.type === "exchange" && r.desiredVariantId) {
      const [desired] = await tx
        .select({ stock: productVariants.stock })
        .from(productVariants)
        .where(eq(productVariants.id, r.desiredVariantId))
        .limit(1);
      if (!desired || desired.stock <= 0) {
        throw new ActionError(
          "The requested replacement size/colour is out of stock — resolve that before passing QC (restock it, or fail QC and contact the customer).",
        );
      }
    }

    const baseRefund = r.refundAmount ?? r.lineTotal;
    const computedRefund =
      input.outcome === "pass"
        ? r.type === "exchange"
          ? 0
          : baseRefund
        : Math.round((baseRefund * (input.partialPercent ?? 0)) / 100);

    // Issue the actual refund before touching our own records — money
    // actually moving is the part that can't be silently "marked done" if it
    // didn't happen.
    let razorpayRefundId: string | undefined;
    if (computedRefund > 0) {
      if (!r.razorpayPaymentId) {
        throw new ActionError("No Razorpay payment on this order — refund manually");
      }
      const refund = await createRefund(r.razorpayPaymentId, computedRefund, {
        returnId,
        orderNumber: r.orderNumber,
      });
      razorpayRefundId = refund.id;
    }

    const [u] = await tx
      .update(returns)
      .set({
        status: "refunded",
        qcOutcome: input.outcome,
        refundAmount: computedRefund,
        adminNote: input.note?.trim() || null,
        ...(razorpayRefundId ? { razorpayRefundId } : {}),
        resolvedAt: new Date(),
      })
      .where(eq(returns.id, returnId))
      .returning();

    return { row: r, updated: u, finalRefund: computedRefund };
  });

  revalidatePath("/studio/returns");
  revalidatePath("/account/returns");

  if (input.outcome === "pass") {
    // The piece is physically back and passed inspection — restock the
    // *returned* variant. For an exchange, the replacement piece shipping
    // back out isn't decremented here — outbound swap shipment tracking
    // isn't built yet (see CLAUDE.md), so that side stays manual for now.
    await applyStockMovement(
      [{ variantId: row.variantId, quantity: row.quantity }],
      1,
      "return",
      row.orderNumber,
    ).catch((err) => {
      console.error("[returns] restock on QC pass failed:", err);
    });
  }

  if (input.outcome === "fail") {
    // Covers both a partial refund and a full deduction — previously a full
    // deduction (finalRefund 0) sent no WhatsApp message at all.
    const refundLine =
      finalRefund > 0
        ? `A refund of ₹${rupees(finalRefund)} has been processed to your original payment method.`
        : "No refund could be issued for this item.";
    await notifyWhatsApp({
      orderId: row.orderId,
      phone: row.phone,
      whatsappOptIn: row.whatsappOptIn,
      templateKey: "return_qc_failed",
      bodyValues: [
        firstNameFromAddress(row.shippingAddress),
        row.orderNumber,
        input.note?.trim() || "The item didn't pass our quality check.",
        refundLine,
      ],
    });
  } else if (finalRefund > 0) {
    // A pass on an exchange ships a swap instead (finalRefund 0) — nothing
    // to notify about here yet (no outbound shipment tracking built).
    await notifyWhatsApp({
      orderId: row.orderId,
      phone: row.phone,
      whatsappOptIn: row.whatsappOptIn,
      templateKey: "refund_processed",
      bodyValues: [
        firstNameFromAddress(row.shippingAddress),
        rupees(finalRefund),
        row.orderNumber,
        "5–7 business days",
      ],
    });
  }

  await logAdminAction(admin.id, "return.qc", "return", returnId, {
    outcome: input.outcome,
    partialPercent: input.partialPercent,
  });

  return updated;
}
