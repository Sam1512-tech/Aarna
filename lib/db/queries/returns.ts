import { and, eq, isNotNull } from "drizzle-orm";
import { after } from "next/server";
import { db, schema } from "@/lib/db";
import { mapDelhiveryStatus, trackShipment } from "@/lib/delhivery";
import { alertAdminSuspiciousActivity } from "@/lib/security/alert-admin";

const { returns } = schema;

export interface ExchangeShipmentStatusSyncResult {
  /** False if this AWB doesn't match any return's outbound exchange
   *  shipment, or the status label doesn't map to anything
   *  mapDelhiveryStatus recognizes. */
  matched: boolean;
  /** False if matched but nothing changed — an intermediate status with
   *  nothing to persist, a repeat "delivered" push, or the return wasn't in
   *  "exchange_shipped" to begin with. */
  applied: boolean;
  /** True only on a genuine NEW arrival at "delivered". */
  newlyDelivered: boolean;
  returnId?: string;
}

/**
 * Applies one observed Delhivery status to whichever return owns this AWB as
 * its OUTBOUND exchange shipment (returns.outboundAwb — the replacement
 * piece going TO the customer, not the reverse pickup bringing the original
 * piece back, which isn't tracked by status pushes at all today).
 *
 * Mirrors applyDelhiveryStatus (lib/db/queries/orders.ts) deliberately
 * closely — shared by both the real-time webhook and the reconciliation
 * sweep below, same defer-notifications-via-after() reasoning (Delhivery's
 * webhook needs a sub-500ms response) — but the state machine here is much
 * smaller: a return only ever needs to move exchange_shipped ->
 * exchange_delivered. There's no equivalent of "out_for_delivery" worth
 * persisting (nothing customer- or admin-facing depends on that
 * intermediate state for a swap), and going backward is never valid.
 *
 * RTO (the replacement bounced back to the studio, undelivered) is handled
 * like the order side's RTO case — flagged for a human via
 * alertAdminSuspiciousActivity rather than guessed at automatically, and
 * deliberately does NOT change `status` away from "exchange_shipped": there
 * is no "exchange_returned" state, and leaving it as "exchange_shipped"
 * keeps it visibly wrong (an admin filtering by that status will keep
 * seeing it) rather than quietly slotting it into "exchange_delivered",
 * which would be false.
 */
export async function applyExchangeShipmentStatus(
  awb: string,
  statusLabel: string,
  statusType?: string,
): Promise<ExchangeShipmentStatusSyncResult> {
  const next = mapDelhiveryStatus(statusLabel, statusType);
  if (!next) return { matched: false, applied: false, newlyDelivered: false };

  const [match] = await db
    .select({ id: returns.id, status: returns.status })
    .from(returns)
    .where(eq(returns.outboundAwb, awb))
    .limit(1);
  if (!match) return { matched: false, applied: false, newlyDelivered: false };

  if (next === "returned") {
    after(() =>
      alertAdminSuspiciousActivity({
        event: "Exchange replacement returned to origin — needs inspection",
        detail: `An outbound exchange shipment (AWB ${awb}, return ${match.id}) was returned to origin by Delhivery instead of reaching the customer. Status left as "exchange_shipped" — check /studio/returns and coordinate a re-ship or refund with the customer by hand.`,
      }).catch((err) => {
        console.error("[exchange shipment status sync] RTO alert failed:", awb, err);
      }),
    );
    return { matched: true, applied: false, newlyDelivered: false, returnId: match.id };
  }

  if (next !== "delivered") {
    // Intermediate statuses (shipped/out_for_delivery/etc.) — nothing to
    // persist; the return is already "exchange_shipped" from the moment the
    // shipment was created.
    return { matched: true, applied: false, newlyDelivered: false, returnId: match.id };
  }

  if (match.status !== "exchange_shipped") {
    // Already delivered (repeat push) or somehow not in the shipped state —
    // no-op either way, never move backward or overwrite a terminal state.
    return { matched: true, applied: false, newlyDelivered: false, returnId: match.id };
  }

  // The earlier `match` read and this write aren't in one transaction, so
  // the webhook and the cron sweep can both read "exchange_shipped" before
  // either commits — checking .returning() length is what tells the loser
  // of that race it didn't actually change anything, instead of both
  // reporting applied/newlyDelivered true for a write only one of them made.
  const [updated] = await db
    .update(returns)
    .set({ status: "exchange_delivered", resolvedAt: new Date() })
    .where(and(eq(returns.id, match.id), eq(returns.status, "exchange_shipped")))
    .returning({ id: returns.id });

  if (!updated) {
    return { matched: true, applied: false, newlyDelivered: false, returnId: match.id };
  }

  return { matched: true, applied: true, newlyDelivered: true, returnId: match.id };
}

/**
 * Reconciliation sweep for exchange shipments — same fallback reasoning as
 * syncInFlightShipmentStatuses (orders.ts): if the real-time webhook
 * silently stops reaching the app, this closes the loop by asking
 * Delhivery's own tracking API directly. Rides the same cron
 * (app/api/cron/sync-delivery-status) as the order sweep rather than a
 * second schedule.
 */
export async function syncInFlightExchangeShipmentStatuses(): Promise<{
  checked: number;
  updated: number;
  newlyDelivered: number;
  errors: number;
}> {
  const inFlight = await db
    .select({ outboundAwb: returns.outboundAwb })
    .from(returns)
    .where(
      and(eq(returns.status, "exchange_shipped"), isNotNull(returns.outboundAwb)),
    );

  const withAwb = inFlight.filter(
    (r): r is { outboundAwb: string } => r.outboundAwb !== null,
  );

  let updated = 0;
  let newlyDelivered = 0;
  let errors = 0;

  for (const { outboundAwb } of withAwb) {
    try {
      const tracking = (await trackShipment(outboundAwb)) as {
        ShipmentData?: { Shipment?: { Status?: { Status?: string; StatusType?: string } } }[];
      };
      const status = tracking?.ShipmentData?.[0]?.Shipment?.Status;
      if (!status?.Status) continue;

      const result = await applyExchangeShipmentStatus(
        outboundAwb,
        status.Status,
        status.StatusType,
      );
      if (result.applied) {
        updated++;
        if (result.newlyDelivered) newlyDelivered++;
      }
    } catch (err) {
      errors++;
      console.error(
        `[sync-delivery-status] exchange tracking check failed for AWB ${outboundAwb}:`,
        err,
      );
    }
  }

  return { checked: withAwb.length, updated, newlyDelivered, errors };
}
