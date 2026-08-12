import { NextResponse } from "next/server";
import { syncInFlightShipmentStatuses } from "@/lib/db/queries/orders";
import { syncInFlightExchangeShipmentStatuses } from "@/lib/db/queries/returns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Vercel Cron hits this every few minutes (see vercel.json — the frequent
 * schedule needs the Pro plan's per-minute cron granularity; Hobby only
 * allows once-daily cron jobs at all) as a fallback for when the Delhivery
 * status webhook (app/api/webhooks/delhivery) stops reaching the app — see
 * syncInFlightShipmentStatuses's own comment for the incident this was built
 * from (a real delivery that never updated the order because the webhook
 * silently wasn't being called). Sweeps both outbound legs that webhook
 * covers — regular orders and exchanges' outbound replacement shipments
 * (lib/db/queries/returns.ts) — since both are equally exposed to the same
 * "webhook silently stopped arriving" failure mode.
 *
 * Deliberately its own route/schedule, separate from the once-daily
 * cleanup-orders cron: that cron's other jobs (stale-shipment alerting in
 * particular) are correctly once-a-day and would turn into inbox spam if run
 * every few minutes — see the comment on alertStaleShipments in
 * app/api/cron/cleanup-orders/route.ts. Same CRON_SECRET auth pattern as
 * that route.
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

  // allSettled, not all — the two sweeps are independent (different tables,
  // different AWB columns) and each hits the same Supabase pooler CLAUDE.md
  // documents as intermittently cancelling queries. Promise.all would let
  // one sweep throwing take the whole request (and the other sweep's
  // still-in-flight work) down with it; this way each reports its own
  // outcome and a bad run of one never silently skips the other.
  const [ordersResult, exchangesResult] = await Promise.allSettled([
    syncInFlightShipmentStatuses(),
    syncInFlightExchangeShipmentStatuses(),
  ]);

  if (ordersResult.status === "rejected") {
    console.error("[sync-delivery-status] orders sweep failed:", ordersResult.reason);
  }
  if (exchangesResult.status === "rejected") {
    console.error("[sync-delivery-status] exchanges sweep failed:", exchangesResult.reason);
  }

  return NextResponse.json({
    ok: ordersResult.status === "fulfilled" && exchangesResult.status === "fulfilled",
    orders:
      ordersResult.status === "fulfilled"
        ? ordersResult.value
        : { error: String(ordersResult.reason) },
    exchanges:
      exchangesResult.status === "fulfilled"
        ? exchangesResult.value
        : { error: String(exchangesResult.reason) },
  });
}
