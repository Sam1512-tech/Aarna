import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { applyDelhiveryStatus } from "@/lib/db/queries/orders";
import { applyExchangeShipmentStatus } from "@/lib/db/queries/returns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Plain !== comparison short-circuits on the first differing byte, leaking
// how many leading characters of the token an attacker guessed correctly
// via response timing. Match the timingSafeEqual pattern already used by
// the Razorpay (lib/razorpay/index.ts) and WhatsApp (lib/whatsapp/index.ts)
// webhooks. timingSafeEqual throws when the two buffers differ in length,
// so a wrong-length token must be caught and treated as a clean mismatch,
// not an unhandled exception.
function tokensMatch(provided: string, expected: string): boolean {
  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(expected);
  if (providedBuf.length !== expectedBuf.length) return false;
  try {
    return crypto.timingSafeEqual(providedBuf, expectedBuf);
  } catch {
    return false;
  }
}

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
  if (!provided || !tokensMatch(provided, token)) {
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

  // Courier webhooks aren't guaranteed to arrive in order (retries, network
  // delays) — an "out for delivery" push that arrives late, after
  // "delivered" was already recorded, must never revert the order backwards.
  // applyDelhiveryStatus (lib/db/queries/orders.ts) owns that guard (and the
  // "delivered" WhatsApp send, and the RTO admin alert) — it's the same
  // logic the daily reconciliation sweep uses, so a shipment's status can
  // never end up different depending on which path last touched it.
  //
  // Run both lookups in parallel rather than trying the order match first
  // and only falling back to the exchange match on a miss — AWBs are
  // Delhivery's own unique identifiers, so a push matches at most one of
  // these two tables, never both, which means running them sequentially
  // means every exchange-shipment push pays for a guaranteed-miss order
  // lookup first. Delhivery requires a sub-500ms P99 response (see
  // applyDelhiveryStatus's own comment) — this keeps both lookups inside
  // one round trip's worth of latency instead of stacking them.
  const [result, exchangeResult] = await Promise.all([
    applyDelhiveryStatus(awb, statusLabel, statusType),
    applyExchangeShipmentStatus(awb, statusLabel, statusType),
  ]);

  if (result.matched && !result.applied) {
    console.warn(
      "[delhivery webhook] ignored out-of-order/invalid transition:",
      awb,
      result.orderNumber,
    );
  }
  if (exchangeResult.matched && !exchangeResult.applied) {
    console.warn(
      "[delhivery webhook] ignored out-of-order/invalid exchange-shipment transition:",
      awb,
      exchangeResult.returnId,
    );
  }
  if (!result.matched && !exchangeResult.matched) {
    // Doesn't necessarily mean anything's wrong — Delhivery pushes status
    // for reverse pickups too (returns.delhiveryReversePickupId), which
    // nothing currently tracks — but a real, valid push vanishing with zero
    // trace is exactly the failure class this whole status-sync feature
    // exists to catch for orders (see the AARNA-001023 incident in
    // CLAUDE.md). Logged, not alerted — this fires routinely for genuinely
    // unrelated/test pushes and would be noisy as an admin alert.
    console.warn("[delhivery webhook] AWB matched no order or exchange shipment:", awb, statusLabel);
  }

  return NextResponse.json({ ok: true });
}
