import { NextResponse } from "next/server";
import {
  alertStaleShipments,
  deleteStaleUnpaidOrders,
  releaseExpiredCheckoutHolds,
  syncInFlightShipmentStatuses,
} from "@/lib/db/queries/orders";
import { cleanupOldRateLimitAttempts } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STALE_DAYS = 7;

/**
 * Vercel Cron hits this daily (see vercel.json) to clear out checkout
 * attempts that never completed payment — every checkout inserts a real
 * order row before Razorpay opens, so an abandoned/declined attempt would
 * otherwise sit in the admin order list forever. Vercel sends
 * `Authorization: Bearer <CRON_SECRET>` on cron-triggered requests; anything
 * without a matching header is rejected the same way the Delhivery webhook
 * gates on its shared token.
 *
 * Also runs releaseExpiredCheckoutHolds as a backstop — it's normally
 * triggered opportunistically by the next checkout attempt (see
 * initCheckout), but on a quiet day with no other checkouts, this is what
 * still frees up stock reserved by an abandoned cart.
 *
 * Also purges old rate_limit_attempts rows (lib/security/rate-limit.ts) —
 * riding this same daily cron instead of a second Vercel Cron entry, since
 * this is the only scheduled job in the project and rate-limit cleanup is
 * just as much "daily maintenance" as the order cleanup above.
 *
 * Also runs syncInFlightShipmentStatuses — for every order still "shipped"/
 * "out_for_delivery", checks Delhivery's own tracking API and applies any
 * real status change (including "delivered") the same way the real-time
 * webhook would. This is the actual auto-heal for the exact failure class
 * alertStaleShipments (below) only detects and emails a human about: if the
 * webhook silently stops reaching the app, this closes the loop itself,
 * same-day, instead of waiting days for a stale-shipment alert.
 *
 * Also runs alertStaleShipments — catches an order stuck "shipped"/
 * "out_for_delivery" well past Delhivery's normal delivery window, which in
 * practice means the Delhivery status webhook stopped reaching the app
 * (see lib/db/queries/orders.ts for the incident this was built from). Runs
 * after syncInFlightShipmentStatuses so it only ever alerts on what that
 * sweep genuinely couldn't resolve itself.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 },
    );
  }

  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const releasedHolds = await releaseExpiredCheckoutHolds();
  const result = await deleteStaleUnpaidOrders(STALE_DAYS);
  const rateLimitRowsDeleted = await cleanupOldRateLimitAttempts();
  const shipmentSync = await syncInFlightShipmentStatuses();
  const staleShipments = await alertStaleShipments();
  return NextResponse.json({
    ok: true,
    releasedHolds,
    rateLimitRowsDeleted,
    shipmentSync,
    staleShipments,
    ...result,
  });
}
