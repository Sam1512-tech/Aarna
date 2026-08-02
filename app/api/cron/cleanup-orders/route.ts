import { NextResponse } from "next/server";
import {
  alertStaleShipments,
  deleteStaleUnpaidOrders,
  releaseExpiredCheckoutHolds,
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
 * Also runs alertStaleShipments — catches an order stuck "shipped"/
 * "out_for_delivery" well past Delhivery's normal delivery window, which in
 * practice means the Delhivery status webhook stopped reaching the app (see
 * lib/db/queries/orders.ts for the incident this was built from). Runs after
 * the sync-delivery-status cron (app/api/cron/sync-delivery-status —
 * separate route, runs every few minutes on the Pro plan's finer cron
 * granularity) has had its own daily-in-aggregate chance to resolve things,
 * so this only ever alerts on what that sweep genuinely couldn't fix itself.
 * Deliberately its own once-a-day cadence, not folded into that frequent
 * cron — it re-alerts every day a shipment stays stuck rather than tracking
 * "already alerted" state (see its own comment), which would turn into
 * inbox spam if it ran every few minutes instead.
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
  const staleShipments = await alertStaleShipments();
  return NextResponse.json({
    ok: true,
    releasedHolds,
    rateLimitRowsDeleted,
    staleShipments,
    ...result,
  });
}
