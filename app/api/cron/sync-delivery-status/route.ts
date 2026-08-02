import { NextResponse } from "next/server";
import { syncInFlightShipmentStatuses } from "@/lib/db/queries/orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Vercel Cron hits this every few minutes (see vercel.json — the frequent
 * schedule needs the Pro plan's per-minute cron granularity; Hobby only
 * allows once-daily cron jobs at all) as a fallback for when the Delhivery
 * status webhook (app/api/webhooks/delhivery) stops reaching the app — see
 * syncInFlightShipmentStatuses's own comment for the incident this was built
 * from (a real delivery that never updated the order because the webhook
 * silently wasn't being called).
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

  const result = await syncInFlightShipmentStatuses();
  return NextResponse.json({ ok: true, ...result });
}
