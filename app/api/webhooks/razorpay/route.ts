import { NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/razorpay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-razorpay-signature");

  if (!signature || !verifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const event = JSON.parse(rawBody);

  // TODO(backend): handle events idempotently keyed on razorpay_order_id.
  //   - payment.captured  → mark order paid, kick off Shiprocket order, send order_placed email + WhatsApp
  //   - payment.failed    → record failure, optionally notify
  //   - refund.processed  → mark return refunded
  switch (event?.event) {
    case "payment.captured":
    case "payment.failed":
    case "refund.processed":
    default:
      break;
  }

  return NextResponse.json({ ok: true });
}
