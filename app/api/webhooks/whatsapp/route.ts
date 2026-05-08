import { NextResponse } from "next/server";
import { verifyDeliveryWebhook } from "@/lib/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-bsp-signature") ?? "";

  if (!verifyDeliveryWebhook(rawBody, signature)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  // TODO(backend): persist delivery / read receipts into message_log.
  //   - sent / delivered / read / failed
  // Surface failures to admin so the team can fall back to email.

  return NextResponse.json({ ok: true });
}
