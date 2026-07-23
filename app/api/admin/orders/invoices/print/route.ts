import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/actions/auth";
import { regenerateInvoicePdfBatch } from "@/lib/actions/admin/orders";
import { ActionError } from "@/lib/action-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Up to 200 orders, each a full A4 page with a line-item table + GST
// breakdown — heavier per-document than the hang-tag PDFs sharing this same
// otherwise-unbounded-duration pattern. Combined with the documented
// Supabase pooler slowness, this can plausibly run long with no partial
// output if left on an implicit default. 60s gives it real headroom without
// asking for more than this project's Vercel plan is expected to allow.
export const maxDuration = 60;

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
    console.error("[admin invoices print] batch invoice generation failed:", err);
    // Only ActionError messages are ever safe to show an admin verbatim —
    // anything else (Supabase pooler hiccup, PDF-lib exception, etc.) is
    // internal detail that must not reach the client. Route handlers don't
    // get Next's server-action digest masking, so we do it ourselves here.
    if (err instanceof ActionError) {
      const status = /not found|no orders|pick at least|pick \d+ orders|none of the selected/i.test(
        err.message,
      )
        ? 400
        : 500;
      return NextResponse.json({ error: err.message }, { status });
    }
    return NextResponse.json(
      { error: "Something went wrong — please try again" },
      { status: 500 },
    );
  }
}
