import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { mapDelhiveryStatus } from "@/lib/delhivery";

const { orders } = schema;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  // Delhivery does not HMAC-sign webhooks. We gate on a shared secret token that
  // is appended to the push URL (e.g. ?token=...) and matched server-side.
  const token = process.env.DELHIVERY_WEBHOOK_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "webhook token not configured" },
      { status: 500 },
    );
  }
  const url = new URL(req.url);
  const provided =
    url.searchParams.get("token") ?? req.headers.get("x-delhivery-token");
  if (provided !== token) {
    return NextResponse.json({ error: "invalid token" }, { status: 401 });
  }

  const payload = await req.json().catch(() => null);
  if (!payload) {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }

  // Delhivery status push shape: { Shipment: { AWB, Status: { Status, StatusType } } }
  const shipment = payload.Shipment ?? payload.shipment;
  const awb: string | undefined = shipment?.AWB ?? shipment?.awb;
  const statusLabel: string | undefined =
    shipment?.Status?.Status ?? shipment?.status?.status;
  const statusType: string | undefined =
    shipment?.Status?.StatusType ?? shipment?.status?.status_type;

  if (!awb || !statusLabel) {
    // Nothing actionable — ack so Delhivery doesn't retry.
    return NextResponse.json({ ok: true });
  }

  const next = mapDelhiveryStatus(statusLabel, statusType);
  if (next) {
    await db
      .update(orders)
      .set({ fulfillmentStatus: next, updatedAt: new Date() })
      .where(eq(orders.awbNumber, awb));
  }

  // NOTE: customer shipping notifications (shipped / out-for-delivery / delivered)
  // are sent by Delhivery's own comms — we do NOT email or WhatsApp here, to avoid
  // sending the customer two messages that say the same thing.
  return NextResponse.json({ ok: true });
}
