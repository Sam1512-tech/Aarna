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
 */
export const FORWARD_TRANSITIONS: Record<FulfillmentStatus, FulfillmentStatus[]> = {
  pending: ["processing", "cancelled"],
  processing: ["shipped", "cancelled"],
  shipped: ["out_for_delivery", "returned"],
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
