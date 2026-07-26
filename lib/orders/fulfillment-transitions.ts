export type FulfillmentStatus =
  | "pending"
  | "processing"
  | "shipped"
  | "out_for_delivery"
  | "delivered"
  | "cancelled"
  | "returned";

/**
 * The full server-enforced fulfillment state machine — every valid forward
 * move, whether triggered by an admin manual action (lib/actions/admin/orders.ts)
 * or a Delhivery status webhook (app/api/webhooks/delhivery/route.ts).
 *
 * "returned" (RTO — the courier couldn't deliver and sent the shipment back)
 * is only reachable from "shipped"/"out_for_delivery", and in practice only
 * the Delhivery webhook ever produces it — the admin order-detail dropdown
 * (app/studio/orders/[orderNumber]/order-detail-view.tsx) deliberately keeps
 * its own narrower copy of this map that never offers "returned" as a manual
 * option, so admins can't jump to it by hand.
 *
 * "shipped" -> "delivered" directly (skipping "out_for_delivery") is
 * deliberately allowed: Delhivery's real scan history for a shipment
 * routinely includes an "Out for delivery" scan that the courier's webhook
 * feed doesn't always push a separate status event for, so the webhook
 * handler can legitimately see a "Delivered" push while our own record is
 * still sitting at "shipped". Before this was added, that case fell
 * through to the handler's own "ignored out-of-order/invalid transition"
 * branch — permanently stranding the order at "shipped" (and, since the
 * "delivered" WhatsApp send lives in that same now-skipped branch, silently
 * skipping the customer notification too) with no error surfaced anywhere.
 * Found while investigating exactly that symptom on a real order
 * (AARNA-001023) whose real Delhivery tracking showed both an "Out for
 * delivery" and a "Delivered" scan that neither ever reached this app.
 */
export const FORWARD_TRANSITIONS: Record<FulfillmentStatus, FulfillmentStatus[]> = {
  pending: ["processing", "cancelled"],
  processing: ["shipped", "cancelled"],
  shipped: ["out_for_delivery", "delivered", "returned"],
  out_for_delivery: ["delivered", "returned"],
  delivered: [],
  cancelled: [],
  returned: [],
};

/** Same status is always a no-op "transition" (e.g. a repeated webhook push). */
export function canTransitionFulfillment(
  from: FulfillmentStatus,
  to: FulfillmentStatus,
): boolean {
  if (from === to) return true;
  return FORWARD_TRANSITIONS[from]?.includes(to) ?? false;
}
