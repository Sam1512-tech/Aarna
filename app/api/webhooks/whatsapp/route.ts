import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { verifyDeliveryWebhook } from "@/lib/whatsapp";
import { alertAdminSuspiciousActivity } from "@/lib/security/alert-admin";

const { messageLog, orders } = schema;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DeliveryStatus = "sent" | "delivered" | "read" | "failed";

// Ranks the non-terminal-negative statuses so an out-of-order or duplicate
// webhook delivery can never regress an already-further-along status — e.g.
// a late "delivered" push arriving after "read" was already recorded must
// not revert it. Same guard philosophy as canTransitionFulfillment for
// Delhivery's fulfillment-status webhook (courier/BSP webhooks generally
// aren't guaranteed to arrive in order).
const STATUS_RANK: Record<Exclude<DeliveryStatus, "failed">, number> = {
  sent: 1,
  delivered: 2,
  read: 3,
};

function shouldApply(current: DeliveryStatus | "queued", next: DeliveryStatus): boolean {
  if (next === "failed") {
    // "failed" is a terminal negative outcome — never overwrite an already-
    // read message with a late/stray failure, but otherwise always apply
    // (including idempotently re-applying to an already-failed row).
    return current !== "read";
  }
  if (current === "failed") return false; // failed is terminal, don't resurrect it
  const currentRank = current === "queued" ? 0 : STATUS_RANK[current];
  return STATUS_RANK[next] > currentRank;
}

/**
 * Interakt's "Template Messages Sent via API" webhook payload shape, per
 * their docs (resource-center article on webhooks for sent-template
 * status). Deliberately defensive — tries a couple of plausible field
 * paths and returns null on anything unrecognized rather than throwing,
 * since this has never been verified against a real live delivery (no
 * webhook was configured before this). A shape mismatch here must never
 * cause Interakt to see an error/retry storm; the raw body is logged on a
 * parse miss so the real shape can be confirmed from server logs against a
 * genuine example instead of guessing again.
 */
function parseStatusEvent(payload: unknown): {
  providerMessageId: string;
  status: DeliveryStatus;
  failureReason?: string;
} | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;
  const data = (root.data ?? root) as Record<string, unknown> | undefined;
  const message = (data?.message ?? root.message) as Record<string, unknown> | undefined;
  if (!message) return null;

  const id = message.id ?? message.message_id;
  const rawStatus = message.message_status ?? message.status ?? root.status;
  if (typeof id !== "string" || typeof rawStatus !== "string") return null;

  const status = rawStatus.toLowerCase();
  if (status !== "sent" && status !== "delivered" && status !== "read" && status !== "failed") {
    return null;
  }

  const failureReasonRaw = message.channel_failure_reason ?? message.failure_reason ?? message.error;
  const failureReason = typeof failureReasonRaw === "string" ? failureReasonRaw : undefined;

  return { providerMessageId: id, status, failureReason };
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-bsp-signature") ?? "";

  if (!verifyDeliveryWebhook(rawBody, signature)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const payload = (() => {
    try {
      return JSON.parse(rawBody);
    } catch {
      return null;
    }
  })();
  if (!payload) {
    console.warn("[whatsapp webhook] invalid JSON body:", rawBody.slice(0, 500));
    return NextResponse.json({ ok: true }); // ack — retrying won't fix malformed JSON
  }

  const event = parseStatusEvent(payload);
  if (!event) {
    // Not a recognized status event (could be a different, not-yet-handled
    // webhook type — e.g. account/template alerts, which were also
    // selectable when registering this webhook). Ack so Interakt doesn't
    // retry, but log the raw shape so an actually-relevant-but-unparsed
    // event is discoverable rather than silently dropped forever.
    console.warn("[whatsapp webhook] unrecognized payload shape:", rawBody.slice(0, 1000));
    return NextResponse.json({ ok: true });
  }

  const [row] = await db
    .select()
    .from(messageLog)
    .where(eq(messageLog.providerMessageId, event.providerMessageId))
    .limit(1);

  if (!row) {
    // No matching send on our side — nothing actionable (could be a
    // message ID format we don't recognize, or an event for something
    // outside message_log entirely).
    return NextResponse.json({ ok: true });
  }

  if (!shouldApply(row.status, event.status)) {
    return NextResponse.json({ ok: true });
  }

  await db
    .update(messageLog)
    .set({
      status: event.status,
      ...(event.status === "failed" ? { errorMessage: event.failureReason ?? "Delivery failed" } : {}),
      updatedAt: new Date(),
    })
    .where(eq(messageLog.id, row.id));

  // A failed delivery means the customer's opted-in WhatsApp notification
  // (order confirmation, delivery notice, refund update…) silently never
  // arrived — surface it so the team can follow up by email instead of it
  // going unnoticed in a DB row nobody's watching.
  if (event.status === "failed" && row.orderId) {
    const [order] = await db
      .select({ orderNumber: orders.orderNumber })
      .from(orders)
      .where(eq(orders.id, row.orderId))
      .limit(1);

    await alertAdminSuspiciousActivity({
      event: "WhatsApp delivery failed",
      detail: `"${row.templateKey}" to ${row.toAddress}${order ? ` (order ${order.orderNumber})` : ""} failed to deliver: ${event.failureReason ?? "no reason given"}. The customer did not receive this notification — consider following up by email.`,
    }).catch((err) => {
      console.error("[whatsapp webhook] admin alert failed:", err);
    });
  }

  return NextResponse.json({ ok: true });
}
