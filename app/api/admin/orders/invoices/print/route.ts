import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/actions/auth";
import { regenerateInvoicePdfBatch } from "@/lib/actions/admin/orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/orders/invoices/print
//
// Body: { orderIds: string[] }
//
// Powers the "print selected invoices" action on the admin orders list —
// same shape as /api/admin/hang-tags/print: pick several rows, get one
// merged PDF back (Content-Disposition: inline, so it opens in a new tab
// ready to print or save), instead of downloading each invoice separately.
export async function POST(req: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 403 });
  }

  let body: { orderIds?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const orderIds = Array.isArray(body.orderIds) ? body.orderIds : [];
  if (orderIds.length === 0) {
    return NextResponse.json({ error: "no orders selected" }, { status: 400 });
  }

  try {
    const pdf = await regenerateInvoicePdfBatch(orderIds);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="invoices.pdf"',
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "invoice generation failed";
    const status = /not found|no orders|pick at least|pick \d+ orders|none of the selected/i.test(message)
      ? 400
      : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
