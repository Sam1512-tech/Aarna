import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { mapDelhiveryStatus } from "@/lib/delhivery";
import { notifyWhatsApp, firstNameFromAddress } from "@/lib/whatsapp/notify";
import { canTransitionFulfillment } from "@/lib/orders/fulfillment-transitions";
import { alertAdminSuspiciousActivity } from "@/lib/security/alert-admin";

const { orders } = schema;

// Days the customer has to request a return after delivery (shown in the
// delivered WhatsApp). Keep in sync with the returns policy.
const RETURN_WINDOW_DAYS = 3;

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
    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.awbNumber, awb))
      .limit(1);

    // Courier webhooks aren't guaranteed to arrive in order (retries, network
    // delays) — an "out for delivery" push that arrives late, after
    // "delivered" was already recorded, must never revert the order
    // backwards. canTransitionFulfillment treats from===to as always allowed
    // (a repeated "delivered" push is still fine — deliveredAt is coalesced
    // below, not overwritten), so this only ever blocks genuine regressions.
    if (order && canTransitionFulfillment(order.fulfillmentStatus, next)) {
      await db
        .update(orders)
        .set({
          fulfillmentStatus: next,
          updatedAt: new Date(),
          // coalesce, not an unconditional set — Delhivery can push "delivered"
          // more than once (retries), and a repeat push must not push the
          // return window's start date forward.
          ...(next === "delivered"
            ? { deliveredAt: sql`coalesce(${orders.deliveredAt}, now())` }
            : {}),
        })
        .where(eq(orders.awbNumber, awb));

      // In-transit / shipped / out-for-delivery updates are left to Delhivery's
      // own comms — we don't duplicate those. On delivery we send Aarna's own
      // branded WhatsApp (a key milestone: return reminder + brand touch). No
      // email here — delivery isn't one of Aarna's transactional emails.
      // (docs/whatsapp-templates.md)
      if (next === "delivered") {
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

      // RTO (courier couldn't deliver, shipment came back) — the garment is
      // physically back in the warehouse, but deliberately NOT auto-restocked:
      // unlike an admin manually cancelling an order (which never left the
      // warehouse), an RTO parcel has been through transit and a failed
      // delivery attempt, so it needs a human eyes-on check for transit
      // damage, tampering, or a courier-side item swap before it's fit to
      // sell again. Auto-restocking here would risk shipping a damaged item
      // to the next customer with nobody having looked at it. Instead, alert
      // an admin so it gets inspected and, if it checks out, restocked by
      // hand via the existing /studio/inventory adjust-stock tool — same
      // "flag for a human, don't guess" principle deleteStaleUnpaidOrders
      // uses for its own irreversible-adjacent decision. Guarded on
      // order.fulfillmentStatus !== "returned" (the pre-update snapshot) so
      // a repeated RTO webhook push for the same order doesn't re-alert.
      if (next === "returned" && order.fulfillmentStatus !== "returned") {
        await alertAdminSuspiciousActivity({
          event: "Shipment returned to origin — needs inspection before restocking",
          detail: `Order ${order.orderNumber} (AWB ${awb}) was returned to origin by Delhivery. Stock was NOT automatically restocked — inspect the parcel for transit damage or tampering first, then add it back via /studio/inventory if it's sellable.`,
        }).catch((err) => {
          console.error("[delhivery webhook] RTO alert failed:", awb, err);
        });
      }
    } else if (order) {
      console.warn(
        "[delhivery webhook] ignored out-of-order/invalid transition:",
        awb,
        `${order.fulfillmentStatus} -> ${next}`,
      );
    }
  }

  return NextResponse.json({ ok: true });
}
