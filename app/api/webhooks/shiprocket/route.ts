import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  // TODO(backend): Shiprocket sends a shared-secret token in the body or headers — verify it.
  const sharedSecret = process.env.SHIPROCKET_WEBHOOK_TOKEN;
  if (!sharedSecret) {
    return NextResponse.json(
      { error: "webhook token not configured" },
      { status: 500 },
    );
  }

  const payload = await req.json().catch(() => null);
  if (!payload) {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }

  // TODO(backend): map status updates to orders.fulfillment_status + send WhatsApp template
  //   - PICKED UP        → order_shipped
  //   - IN TRANSIT       → (no message)
  //   - OUT FOR DELIVERY → out_for_delivery
  //   - DELIVERED        → delivered
  //   - RTO              → cancelled / returned

  return NextResponse.json({ ok: true });
}
