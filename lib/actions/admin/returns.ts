"use server";

import { and, desc, eq, isNull, notInArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { requireAdmin } from "@/lib/actions/auth";
import { requestReversePickup, fetchWaybill, createShipment } from "@/lib/delhivery";
import { createRefund, razorpayApiErrorDetail } from "@/lib/razorpay";
import { insertCodRefundCreditNote } from "@/lib/db/queries/orders";
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
import { alertAdminSuspiciousActivity } from "@/lib/security/alert-admin";

const FALLBACK_ITEM_WEIGHT_GRAMS = 450; // typical garment when variant has no weight

const { returns, orderItems, orders, orderRefundEvents, productVariants, products } = schema;

// Statuses updateReturnStatus will actually accept — "refunded" (only via
// markReturnQc) and "exchange_shipped"/"exchange_delivered" (only via
// createExchangeShipment / the Delhivery status sync) are deliberately
// excluded so an admin can't set them without the real side effect behind
// each actually happening.
const RETURN_STATUSES = [
  "requested",
  "approved",
  "rejected",
  "picked",
  "received",
] as const;
type ReturnStatus = (typeof RETURN_STATUSES)[number];

// Every status a return row can actually hold — broader than ReturnStatus
// above since this is what admin list filtering needs to match against, not
// what's manually settable.
type AnyReturnStatus =
  | ReturnStatus
  | "refunded"
  | "exchange_shipped"
  | "exchange_delivered"
  | "refund_pending";

// Once a return reaches any of these, updateReturnStatus must never write to
// it again — each is owned by a different, more specific action with its own
// real side effect (markReturnQc's refund/approval, createExchangeShipment's
// real Delhivery booking, or a closed rejection) and none of those side
// effects can be undone by silently regressing the status back to an earlier
// manual state. Found missing entirely in an adversarial review: without
// this, a stale second tab/session could call updateReturnStatus on a return
// createExchangeShipment was mid-flight on (its own claim writes outboundAwb
// but never locks or checks `status`), causing a real, already-booked
// Delhivery shipment to be silently orphaned when createExchangeShipment's
// own conditional final write then fails to match and rolls back — or, after
// the fact, regress an already-refunded/shipped/delivered request back to
// "received" and let it be QC-passed a second time (a second real Razorpay
// refund, a second real restock, or false "still preparing" copy shown to a
// customer whose swap already arrived).
const TERMINAL_RETURN_STATUSES = [
  "rejected",
  "refunded",
  "exchange_shipped",
  "exchange_delivered",
  // COD return awaiting the admin's manual "record COD refund sent"
  // confirmation (recordCodRefundSent) — the only action allowed to move it
  // further, same "each terminal status is owned by one specific action"
  // reasoning as the others in this list.
  "refund_pending",
] as const;

// ── Read ─────────────────────────────────────────────────────────────────────

export interface AdminReturnFilters {
  status?: AnyReturnStatus;
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
        // COD manual-refund fields — refundUpiId is where a refund_pending
        // return's money is headed; codRefundReference is the admin's own
        // optional note once recordCodRefundSent confirms it was sent.
        paymentMethod: orders.paymentMethod,
        refundUpiId: returns.refundUpiId,
        codRefundReference: returns.codRefundReference,
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
        // Outbound replacement shipment AWB — null until createExchangeShipment
        // actually books it (status "exchange_shipped"/"exchange_delivered").
        outboundAwb: returns.outboundAwb,
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

  // Fast-path friendly error — the real guard against a race is the
  // conditional UPDATE below, this just avoids a pointless reverse-pickup
  // Delhivery call for a request that's already terminal.
  if ((TERMINAL_RETURN_STATUSES as readonly string[]).includes(row.status)) {
    throw new ActionError(
      `This request is already "${row.status}" and can't be changed from here.`,
    );
  }

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

  // Conditional on the return STILL not being terminal — closes the actual
  // race (the fast-path check above only rejects what was already terminal
  // at read time; this is what stops a write from landing if the return
  // became terminal in between, e.g. createExchangeShipment's own claim
  // committed while this request's reverse-pickup call was in flight).
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
    .where(
      and(
        eq(returns.id, returnId),
        // Derived from TERMINAL_RETURN_STATUSES itself, not a separate
        // hand-written list — a hand-written copy of this exact guard is
        // what let "refund_pending" get added to TERMINAL_RETURN_STATUSES
        // (closing the fast-path check above) without also closing this
        // race-guard, silently reopening the same class of race the fast
        // path was supposed to prevent for the new status. Deriving from
        // the single source of truth means the two can never drift apart
        // again.
        notInArray(returns.status, [...TERMINAL_RETURN_STATUSES]),
      ),
    )
    .returning();

  if (!updated) {
    throw new ActionError(
      "This request's status changed while your update was in progress — refresh and try again.",
    );
  }

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
  //
  // That join-wide lock has a second, load-bearing effect this comment used
  // to not mention: it also locks the `orders` row for this whole
  // transaction, including across the Razorpay `createRefund()` call below.
  // recordRefund (lib/db/queries/orders.ts), triggered by Razorpay's
  // refund.processed webhook, takes its own `FOR UPDATE` on that same order
  // row as its very first statement — so it necessarily queues behind this
  // transaction and can only start once the `returns.razorpayRefundId` write
  // below has committed. That's what guarantees recordRefund's credit-note
  // "precise match" query (matching a `returns` row by razorpayRefundId)
  // never runs before this write lands. Narrowing this lock (e.g.
  // `.for("update", { of: [returns] })`, a natural-looking optimization to
  // stop blocking unrelated order reads while waiting on Razorpay) would
  // silently remove that guarantee — recordRefund would then fall into its
  // (non-catastrophic, needsReview-flagged) fallback path instead, but only
  // sometimes and without any signal that the ordering assumption broke.
  const { row, updated, finalRefund, codRefundPending } = await db.transaction(async (tx) => {
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
        paymentMethod: orders.paymentMethod,
        refundUpiId: returns.refundUpiId,
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
    // didn't happen. A COD order has no Razorpay payment to refund against
    // at all — that used to be treated as an unexpected data problem
    // (hard-throw, "refund manually"), but for COD it's the normal, expected
    // case: parked at refund_pending awaiting the admin's manual UPI
    // transfer + recordCodRefundSent confirmation, rather than blocking QC
    // entirely.
    let razorpayRefundId: string | undefined;
    let codRefundPending = false;
    if (computedRefund > 0) {
      if (r.razorpayPaymentId) {
        let refund: Awaited<ReturnType<typeof createRefund>>;
        try {
          refund = await createRefund(r.razorpayPaymentId, computedRefund, {
            returnId,
            orderNumber: r.orderNumber,
          });
        } catch (err) {
          // Surface Razorpay's own rejection reason (safe to show — it's
          // their explanation of why THIS refund was refused, not internal
          // system detail) instead of letting it fall through as a generic,
          // undiagnosable "Couldn't submit QC". Anything that isn't a
          // recognized API-rejection shape (a network failure, a timeout)
          // rethrows unchanged and stays masked, same as before this fix.
          const detail = razorpayApiErrorDetail(err);
          if (detail) {
            throw new ActionError(
              `Razorpay refused this refund${detail.code ? ` (${detail.code})` : ""}: ${detail.description}`,
            );
          }
          throw err;
        }
        razorpayRefundId = refund.id;
      } else if (r.paymentMethod === "cod") {
        codRefundPending = true;
      } else {
        // Not COD and no Razorpay payment on record — still a genuine
        // data problem, not something to silently park.
        throw new ActionError("No Razorpay payment on this order — refund manually");
      }
    }

    const nextStatus = codRefundPending ? "refund_pending" : "refunded";

    const [u] = await tx
      .update(returns)
      .set({
        status: nextStatus,
        qcOutcome: input.outcome,
        refundAmount: computedRefund,
        adminNote: input.note?.trim() || null,
        ...(razorpayRefundId ? { razorpayRefundId } : {}),
        // Not resolved yet if a COD refund is still just parked — no money
        // has moved. resolvedAt is set for real once recordCodRefundSent
        // confirms it was actually sent.
        ...(nextStatus === "refunded" ? { resolvedAt: new Date() } : {}),
      })
      .where(eq(returns.id, returnId))
      .returning();

    return { row: r, updated: u, finalRefund: computedRefund, codRefundPending };
  });

  revalidatePath("/studio/returns");
  revalidatePath("/account/returns");

  if (input.outcome === "pass") {
    // The piece is physically back and passed inspection — restock the
    // *returned* variant. For an exchange, the replacement variant is
    // decremented separately, in createExchangeShipment below, at the
    // moment its outbound shipment is actually booked — not here, since QC
    // passing doesn't guarantee the admin ships it in the same instant.
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
  } else if (finalRefund > 0 && !codRefundPending) {
    // A pass on an exchange sends no money (finalRefund 0) — the actual
    // "your swap has shipped" moment is createExchangeShipment below, a
    // separate admin action, not this one (see that function's comment for
    // why shipment creation isn't bundled into this transaction).
    //
    // codRefundPending is excluded here on purpose — nothing has actually
    // been refunded yet for a COD return parked at refund_pending (there's
    // no Razorpay payment to refund against), so sending this template now
    // would tell the customer money already moved when it hasn't.
    // recordCodRefundSent sends its own notification once the admin
    // actually confirms the UPI transfer went out.
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

/**
 * Closes the loop on a COD return markReturnQc parked at "refund_pending" —
 * there's no Razorpay payment to refund against for a COD order, so the
 * admin sends the money by hand via UPI (to the customer-supplied
 * refundUpiId) and confirms it here once actually sent. No payout API
 * integration; this only records that it happened.
 *
 * Race-safe the same way markReturnQc is: a locked read (SELECT ... FOR
 * UPDATE) followed by an explicit status check inside the transaction — a
 * concurrent second call (double-click, two admin tabs) blocks on the row
 * lock until the first commits, then re-reads status "refunded" and
 * correctly fails the check instead of ever generating a second credit note
 * or re-sending the refund-processed notification.
 *
 * Also records the refund against the ORDER, not just the return —
 * inserting an order_refund_events row and flipping orders.paymentStatus to
 * "refunded"/"partially_refunded" once the cumulative refunded total
 * actually covers the order, exactly mirroring what recordRefund
 * (lib/db/queries/orders.ts) already does for a real Razorpay refund. Both
 * writes happen inside this same locked transaction, atomically with the
 * return's own status flip — without this, getOrderStats's revenue calc
 * (which nets grossCaptured against order_refund_events) would never learn
 * a COD order was refunded and would overstate revenue by the refunded
 * amount forever, and every other surface that reads orders.paymentStatus
 * (the invoice PDF, the admin order list/detail, both accountant reports,
 * the customer's own order list) would keep showing "Paid" indefinitely.
 */
export async function recordCodRefundSent(
  returnId: string,
  input: { reference?: string },
): Promise<{ ok: true }> {
  const admin = await requireAdmin();

  const row = await db.transaction(async (tx) => {
    const [r] = await tx
      .select({
        status: returns.status,
        refundAmount: returns.refundAmount,
        refundUpiId: returns.refundUpiId,
        orderItemId: returns.orderItemId,
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
      .for("update");
    if (!r) throw new ActionError("Return not found");
    if (r.status !== "refund_pending") {
      throw new ActionError(
        `This return is "${r.status}", not awaiting a COD refund confirmation`,
      );
    }

    await tx
      .update(returns)
      .set({
        status: "refunded",
        resolvedAt: new Date(),
        codRefundReference: input.reference?.trim() || null,
      })
      .where(eq(returns.id, returnId));

    const refundAmount = r.refundAmount ?? 0;
    if (refundAmount > 0) {
      await tx.insert(orderRefundEvents).values({
        orderId: r.orderId,
        razorpayRefundId: null,
        amountPaise: refundAmount,
      });

      // Same cumulative-total basis recordRefund uses (see its own
      // comment): the sum of order_items.lineTotal, not orders.total —
      // markReturnQc always refunds the returned item's raw lineTotal, so
      // that's the true ceiling every refund event is drawn from
      // regardless of shipping/discount/codFee.
      const [{ total: cumulativeRefunded }] = await tx
        .select({
          total: sql<number>`coalesce(sum(${orderRefundEvents.amountPaise}), 0)::int`,
        })
        .from(orderRefundEvents)
        .where(eq(orderRefundEvents.orderId, r.orderId));

      const [{ total: refundableTotal }] = await tx
        .select({
          total: sql<number>`coalesce(sum(${orderItems.lineTotal}), 0)::int`,
        })
        .from(orderItems)
        .where(eq(orderItems.orderId, r.orderId));

      const nextPaymentStatus: "refunded" | "partially_refunded" =
        cumulativeRefunded >= refundableTotal ? "refunded" : "partially_refunded";

      await tx
        .update(orders)
        .set({ paymentStatus: nextPaymentStatus, updatedAt: new Date() })
        .where(eq(orders.id, r.orderId));
    }

    return r;
  });

  // Credit note + notification are best-effort, same "the money already
  // moved, don't let a downstream hiccup look like the whole action failed"
  // rule ensureCreditNoteForRefund's own caller follows — the refund_pending
  // -> refunded transition above is already committed and durable.
  try {
    await insertCodRefundCreditNote({
      orderId: row.orderId,
      returnId,
      orderItemId: row.orderItemId,
      amountRefundedPaise: row.refundAmount ?? 0,
    });
  } catch (err) {
    console.error(`[returns] COD refund credit note generation failed for return ${returnId}:`, err);
    await alertAdminSuspiciousActivity({
      event: "Credit note generation failed after a COD refund was confirmed sent",
      detail: `Return ${returnId} on order ${row.orderNumber} was confirmed refunded via UPI, but generating its GST credit note failed. The refund itself is real and recorded — a credit note needs to be created by hand. Error: ${err instanceof Error ? err.message : String(err)}`,
    }).catch((alertErr) => {
      console.error("[returns] COD refund credit-note-failure alert itself failed:", alertErr);
    });
  }

  if ((row.refundAmount ?? 0) > 0) {
    await notifyWhatsApp({
      orderId: row.orderId,
      phone: row.phone,
      whatsappOptIn: row.whatsappOptIn,
      templateKey: "refund_processed",
      bodyValues: [
        firstNameFromAddress(row.shippingAddress),
        rupees(row.refundAmount ?? 0),
        row.orderNumber,
        "2–3 business days",
      ],
    });
  }

  revalidatePath("/studio/returns");
  revalidatePath("/account/returns");

  await logAdminAction(admin.id, "return.record_cod_refund_sent", "return", returnId, {
    reference: input.reference,
  });

  return { ok: true };
}

export interface RecordExternalRefundInput {
  outcome: "pass" | "fail";
  /**
   * Required when outcome is "fail" — the actual amount (in paise) that was
   * refunded externally. A "pass" always uses the return's own stored
   * refundAmount (or the item's full line total), the same full-refund
   * basis a live QC pass would use — mirrors recordCodRefundSent trusting
   * that same stored amount rather than re-deriving it.
   */
  refundAmountPaise?: number;
  razorpayRefundId?: string;
  note: string;
}

/**
 * Reconciles a return whose refund already happened OUTSIDE markReturnQc —
 * e.g. issued directly via the Razorpay dashboard instead of through QC.
 * Never calls Razorpay: doing so would either double-refund or (more
 * likely) be rejected outright since the payment's already been refunded —
 * exactly the confusing, hard-to-diagnose failure this project hit on a
 * real order (AARNA-001126) before this action existed. This only records
 * what already happened.
 *
 * Deliberately a separate action from markReturnQc, not a flag on it — same
 * "each real side effect owned by one specific action" reasoning as
 * recordCodRefundSent/createExchangeShipment (see TERMINAL_RETURN_STATUSES'
 * own comment above): a checkbox buried in the live refund form risks being
 * mis-clicked on a return that should actually get a real refund, silently
 * marking it "refunded" without ever refunding the customer. A wholly
 * separate action + its own clearly-labeled form is much harder to reach by
 * accident.
 *
 * Sends no WhatsApp notification — this is reconciling something that
 * already happened (often weeks earlier, per the AARNA-001126 precedent),
 * not a live event; a "your refund has been processed" message today about
 * an old refund would just confuse the customer.
 *
 * Scoped to plain returns only for now — an exchange whose QC failed can
 * also carry a real refund in principle, but every real case seen so far
 * has been a plain return; extend this if that combination actually comes
 * up rather than building for it speculatively now.
 */
export async function recordReturnRefundedExternally(
  returnId: string,
  input: RecordExternalRefundInput,
) {
  const admin = await requireAdmin();

  const note = input.note?.trim() ?? "";
  if (note.length < 10) {
    throw new ActionError("A note (min 10 characters) explaining what happened is required");
  }

  const { row, updated } = await db.transaction(async (tx) => {
    const [r] = await tx
      .select({
        status: returns.status,
        type: returns.type,
        refundAmount: returns.refundAmount,
        lineTotal: orderItems.lineTotal,
        variantId: orderItems.variantId,
        quantity: orderItems.quantity,
        orderNumber: orders.orderNumber,
      })
      .from(returns)
      .innerJoin(orderItems, eq(orderItems.id, returns.orderItemId))
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(eq(returns.id, returnId))
      .for("update");
    if (!r) throw new ActionError("Return not found");
    if (r.type !== "return") {
      throw new ActionError(
        "Exchanges don't have a refund to record this way — use the outbound shipment options instead",
      );
    }
    if (r.status !== "received") {
      throw new ActionError("This can only be recorded once the item has been received");
    }

    const baseRefund = r.refundAmount ?? r.lineTotal;
    let refundAmount: number;
    if (input.outcome === "pass") {
      refundAmount = baseRefund;
    } else {
      if (
        input.refundAmountPaise === undefined ||
        !Number.isFinite(input.refundAmountPaise) ||
        input.refundAmountPaise < 0 ||
        input.refundAmountPaise > baseRefund
      ) {
        throw new ActionError(
          `Enter the amount actually refunded, between ₹0 and ₹${(baseRefund / 100).toFixed(2)}`,
        );
      }
      refundAmount = input.refundAmountPaise;
    }

    const [u] = await tx
      .update(returns)
      .set({
        status: "refunded",
        qcOutcome: input.outcome,
        refundAmount,
        razorpayRefundId: input.razorpayRefundId?.trim() || null,
        adminNote: note,
        resolvedAt: new Date(),
      })
      .where(eq(returns.id, returnId))
      .returning();

    return { row: r, updated: u };
  });

  revalidatePath("/studio/returns");
  revalidatePath("/account/returns");

  if (input.outcome === "pass") {
    // Best-effort, same reasoning as every other restock call in this
    // file: the refund already genuinely happened, a bookkeeping failure
    // here shouldn't look like the whole reconciliation failed.
    await applyStockMovement(
      [{ variantId: row.variantId, quantity: row.quantity }],
      1,
      "return",
      row.orderNumber,
    ).catch((err) => {
      console.error(
        `[returns] restock after recording an external refund failed (return ${returnId}):`,
        err,
      );
    });
  }

  await logAdminAction(admin.id, "return.record_external_refund", "return", returnId, {
    outcome: input.outcome,
    razorpayRefundId: input.razorpayRefundId,
  });

  return updated;
}

// ── Exchange outbound shipment ──────────────────────────────────────────────

/**
 * Books the outbound Delhivery shipment for a passed exchange's replacement
 * piece — the "send the customer their new size/colour" half of an
 * exchange, previously entirely manual (see CLAUDE.md's Jul 18 status
 * notes). Deliberately its own action, not folded into markReturnQc's pass
 * branch, for the same reason createDelhiveryShipment (lib/actions/admin/
 * orders.ts) is a separate action from markOrderPaid: this is a real,
 * slow, synchronous external API call, and nesting it inside another
 * transaction (markReturnQc's Razorpay-refund transaction) would hold that
 * transaction's lock open across it and roll back a real database write on
 * a transient failure. Mirrors createDelhiveryShipment's exact pattern —
 * atomically claim BEFORE calling Delhivery, conditional final write,
 * rollback-on-failure, and an admin alert if the return's state changes out
 * from under the claim while the API call is in flight.
 */
export async function createExchangeShipment(returnId: string) {
  const admin = await requireAdmin();

  const [row] = await db
    .select({
      status: returns.status,
      type: returns.type,
      outboundAwb: returns.outboundAwb,
      desiredVariantId: returns.desiredVariantId,
      orderId: orders.id,
      orderNumber: orders.orderNumber,
      quantity: orderItems.quantity,
      shippingAddress: orders.shippingAddress,
      total: orders.total,
    })
    .from(returns)
    .innerJoin(orderItems, eq(orderItems.id, returns.orderItemId))
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(eq(returns.id, returnId))
    .limit(1);
  if (!row) throw new ActionError("Return not found");

  if (row.type !== "exchange") {
    throw new ActionError("Only exchanges have an outbound shipment to create");
  }
  if (row.status !== "refunded") {
    throw new ActionError(
      `Cannot ship a replacement while the request is "${row.status}" — QC must pass first`,
    );
  }
  if (row.outboundAwb) {
    throw new ActionError(`Shipment already exists (AWB ${row.outboundAwb})`);
  }
  if (!row.desiredVariantId) {
    throw new ActionError("No replacement variant was chosen for this exchange");
  }

  const [desired] = await db
    .select({
      stock: productVariants.stock,
      weightGrams: productVariants.weightGrams,
    })
    .from(productVariants)
    .where(eq(productVariants.id, row.desiredVariantId))
    .limit(1);
  if (!desired || desired.stock <= 0) {
    // Re-checked here on top of markReturnQc's own pass-time check — the
    // gap between QC passing and an admin actually clicking "ship" is
    // another window the desired size/colour can sell out in, exactly the
    // same reasoning as the QC-time check.
    throw new ActionError(
      "The requested replacement size/colour is out of stock — restock it before shipping.",
    );
  }

  // Atomically claim BEFORE calling Delhivery's real waybill+manifest API —
  // same reasoning as createDelhiveryShipment: the guard checks above are
  // just a friendly-error fast path, not a lock. Only the request whose
  // WHERE clause still matches (outbound_awb still NULL, status still
  // "refunded") claims the return with a "PENDING" sentinel; a second
  // near-simultaneous click gets zero rows back and aborts before ever
  // touching Delhivery.
  const claimed = await db
    .update(returns)
    .set({ outboundAwb: "PENDING" })
    .where(
      and(
        eq(returns.id, returnId),
        isNull(returns.outboundAwb),
        eq(returns.status, "refunded"),
      ),
    )
    .returning({ id: returns.id });

  if (claimed.length === 0) {
    throw new ActionError(
      "Shipment creation is already in progress for this request — refresh and try again",
    );
  }

  const address = row.shippingAddress as AddressInput;

  try {
    const weightGrams = Math.max(
      (desired.weightGrams ?? FALLBACK_ITEM_WEIGHT_GRAMS) * row.quantity,
      100,
    );

    const requestedWaybill = await fetchWaybill();

    // createShipment validates Delhivery's response and throws if the
    // shipment was actually rejected — the returned waybill is what
    // Delhivery confirmed, trusted over requestedWaybill as the source of
    // truth for what was really created.
    const { waybill } = await createShipment({
      orderNumber: `${row.orderNumber}-EXC`,
      waybill: requestedWaybill,
      name: address.fullName,
      address: [address.line1, address.line2].filter(Boolean).join(", "),
      pincode: address.pincode,
      city: address.city,
      state: address.state,
      phone: address.phone,
      // A replacement swap carries no new payment — Delhivery still wants a
      // declared parcel value for insurance/liability purposes, so the
      // original order's total stands in (there's no per-item price
      // breakdown worth the complexity here for a same-product size/colour
      // swap).
      totalAmount: Math.round(row.total / 100),
      weightGrams,
      // Explicit regardless of the original order's paymentMethod — an
      // exchange shipment never itself collects cash (the item was already
      // paid for, or is COD-pending on the original order; either way,
      // nothing is due on this replacement parcel).
      paymentMode: "Prepaid",
    });

    // Conditional on both the "PENDING" claim AND status still being
    // "refunded" — the claim above only stops a second createExchangeShipment
    // call from racing this one; it does nothing to stop some other action
    // changing this return's status while the slow Delhivery call above was
    // in flight.
    const [updated] = await db
      .update(returns)
      .set({ outboundAwb: waybill, status: "exchange_shipped", resolvedAt: new Date() })
      .where(
        and(
          eq(returns.id, returnId),
          eq(returns.outboundAwb, "PENDING"),
          eq(returns.status, "refunded"),
        ),
      )
      .returning();

    if (!updated) {
      console.error(
        `[returns] createExchangeShipment: return ${returnId} changed state before the final write — a real Delhivery shipment (AWB ${waybill}) was booked but NOT recorded.`,
      );
      await alertAdminSuspiciousActivity({
        event: "Exchange shipment booked for a return that changed state mid-request",
        detail: `Return ${returnId} (order ${row.orderNumber}): a real Delhivery shipment (AWB ${waybill}) was just booked, but the return's status changed while that call was in progress, so the AWB was deliberately NOT saved. The shipment is real and needs manual reconciliation: check Delhivery's panel and /studio/returns.`,
      }).catch((alertErr) => {
        console.error("[returns] createExchangeShipment reconciliation alert failed:", alertErr);
      });
      throw new ActionError(
        `A Delhivery shipment (AWB ${waybill}) was created, but this request's status changed while that was in progress — it was not recorded and needs manual reconciliation. Check Delhivery's panel.`,
      );
    }

    // Decrement the replacement variant's stock now that it's genuinely
    // going out the door — best-effort, logged rather than blocking: the
    // real shipment already exists regardless of whether this bookkeeping
    // write succeeds.
    await applyStockMovement(
      [{ variantId: row.desiredVariantId, quantity: row.quantity }],
      -1,
      "sale",
      row.orderNumber,
    ).catch((err) => {
      console.error(
        `[returns] stock decrement for exchange shipment failed (return ${returnId}, variant ${row.desiredVariantId}):`,
        err,
      );
    });

    revalidatePath("/studio/returns");
    revalidatePath("/account/returns");

    await logAdminAction(admin.id, "return.ship_exchange", "return", returnId, {
      awbNumber: updated.outboundAwb,
    });

    return updated;
  } catch (err) {
    // The Delhivery call (or something after it) failed — clear the
    // "PENDING" claim back to NULL so the request doesn't sit permanently
    // looking like it has a shipment when it doesn't, and so a retry can
    // actually claim it again. Only clears it if it's still our sentinel —
    // never clobber a real AWB that landed some other way.
    await db
      .update(returns)
      .set({ outboundAwb: null })
      .where(and(eq(returns.id, returnId), eq(returns.outboundAwb, "PENDING")))
      .catch((rollbackErr) => {
        console.error(
          `[returns] failed to roll back PENDING outbound-AWB claim for return ${returnId} after shipment creation failure:`,
          rollbackErr,
        );
        alertAdminSuspiciousActivity({
          event: "Exchange stuck with a PENDING shipment claim after a failed rollback",
          detail: `Return ${returnId} (order ${row.orderNumber}): shipment creation failed and the follow-up cleanup also failed, so the request is now stuck showing a shipment claim it doesn't really have — "Ship replacement" won't reappear for it. Needs a manual outbound_awb reset on the returns row, or coordinate the swap outside the system.`,
        }).catch((alertErr) => {
          console.error("[returns] rollback-failure alert itself failed:", alertErr);
        });
      });
    throw err;
  }
}

// A manually-recorded outbound reference is stored in the same outboundAwb
// column a real Delhivery waybill uses (no schema change — same pragmatic
// reuse this table already does for codRefundReference), tagged with this
// prefix so the admin UI can tell the two apart and never render a
// Delhivery tracking link for a shipment Delhivery never actually booked.
const MANUAL_SHIPMENT_PREFIX = "MANUAL:";

/**
 * Records an exchange's replacement as shipped by some means outside
 * Delhivery — e.g. an in-city order handed to Porter or another local
 * courier, or delivered in person. Same moment as createExchangeShipment
 * (a passed exchange, still owed its outbound shipment) and the same
 * guards/atomic-claim pattern, just without ever calling Delhivery: nothing
 * here should differ from a real Delhivery-booked shipment except which
 * carrier actually delivered it and that outboundAwb holds a plain
 * reference instead of a real waybill.
 */
export async function markExchangeShippedManually(
  returnId: string,
  input: { carrier: string; trackingReference?: string },
) {
  const admin = await requireAdmin();

  const carrier = input.carrier.trim();
  if (!carrier) {
    throw new ActionError("Carrier / method is required (e.g. Porter, hand-delivered)");
  }

  const [row] = await db
    .select({
      status: returns.status,
      type: returns.type,
      outboundAwb: returns.outboundAwb,
      desiredVariantId: returns.desiredVariantId,
      orderNumber: orders.orderNumber,
      quantity: orderItems.quantity,
    })
    .from(returns)
    .innerJoin(orderItems, eq(orderItems.id, returns.orderItemId))
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(eq(returns.id, returnId))
    .limit(1);
  if (!row) throw new ActionError("Return not found");

  if (row.type !== "exchange") {
    throw new ActionError("Only exchanges have an outbound shipment to record");
  }
  if (row.status !== "refunded") {
    throw new ActionError(
      `Cannot record a shipment while the request is "${row.status}" — QC must pass first`,
    );
  }
  if (row.outboundAwb) {
    throw new ActionError(`Shipment already exists (${row.outboundAwb})`);
  }
  if (!row.desiredVariantId) {
    throw new ActionError("No replacement variant was chosen for this exchange");
  }

  const [desired] = await db
    .select({ stock: productVariants.stock })
    .from(productVariants)
    .where(eq(productVariants.id, row.desiredVariantId))
    .limit(1);
  if (!desired || desired.stock <= 0) {
    // Same re-check createExchangeShipment does — the desired size/colour
    // can still have sold out between QC passing and this being recorded,
    // manual courier or not.
    throw new ActionError(
      "The requested replacement size/colour is out of stock — restock it before recording this shipment.",
    );
  }

  const reference = `${MANUAL_SHIPMENT_PREFIX}${carrier}${
    input.trackingReference?.trim() ? ` · ${input.trackingReference.trim()}` : ""
  }`;

  // Same atomic-claim shape as createExchangeShipment's final write — only
  // a request still genuinely unshipped and still QC-passed claims it, so
  // this can't race a concurrent createExchangeShipment/
  // markExchangeShippedManually call for the same return.
  const [updated] = await db
    .update(returns)
    .set({ outboundAwb: reference, status: "exchange_shipped", resolvedAt: new Date() })
    .where(
      and(
        eq(returns.id, returnId),
        isNull(returns.outboundAwb),
        eq(returns.status, "refunded"),
      ),
    )
    .returning();

  if (!updated) {
    throw new ActionError(
      "This request's status changed while your update was in progress — refresh and try again",
    );
  }

  // Best-effort, same reasoning as createExchangeShipment: the replacement
  // has genuinely already left the building by the time an admin is
  // recording this, so a bookkeeping failure here shouldn't look like the
  // whole action failed.
  await applyStockMovement(
    [{ variantId: row.desiredVariantId, quantity: row.quantity }],
    -1,
    "sale",
    row.orderNumber,
  ).catch((err) => {
    console.error(
      `[returns] stock decrement for manual exchange shipment failed (return ${returnId}, variant ${row.desiredVariantId}):`,
      err,
    );
  });

  revalidatePath("/studio/returns");
  revalidatePath("/account/returns");

  await logAdminAction(admin.id, "return.ship_exchange_manual", "return", returnId, {
    carrier,
    trackingReference: input.trackingReference,
  });

  return updated;
}
