import { NextResponse } from "next/server";
import { deleteStaleUnpaidOrders } from "@/lib/db/queries/orders";

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

  const result = await deleteStaleUnpaidOrders(STALE_DAYS);
  return NextResponse.json({ ok: true, ...result });
}
