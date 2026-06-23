import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { mapDelhiveryStatus } from "@/lib/delhivery";
import { notifyWhatsApp, firstNameFromAddress } from "@/lib/whatsapp/notify";

const { orders } = schema;

// Days the customer has to request a return after delivery (shown in the
// delivered WhatsApp). Keep in sync with the returns policy.
const RETURN_WINDOW_DAYS = 7;

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

    // In-transit / shipped / out-for-delivery updates are left to Delhivery's own
    // comms — we don't duplicate those. On delivery we send Aarna's own branded
    // WhatsApp (a key milestone: return reminder + brand touch). No email here —
    // delivery isn't one of Aarna's transactional emails. (docs/whatsapp-templates.md)
    if (next === "delivered") {
      const [order] = await db
        .select()
        .from(orders)
        .where(eq(orders.awbNumber, awb))
        .limit(1);
      if (order) {
        await notifyWhatsApp({
          orderId: order.id,
          phone: order.phone,
          whatsappOptIn: order.whatsappOptIn,
          templateKey: "delivered",
          bodyValues: [
            firstNameFromAddress(order.shippingAddress),
            order.orderNumber,
            String(RETURN_WINDOW_DAYS),
          ],
        });
      }
    }
  }

  return NextResponse.json({ ok: true });
}
