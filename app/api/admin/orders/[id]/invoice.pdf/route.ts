import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/actions/auth";
import { regenerateInvoicePdf } from "@/lib/actions/admin/orders";
import { ActionError } from "@/lib/action-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/orders/[id]/invoice.pdf
//
// Server actions can't stream a binary Buffer to the browser, so the admin
// order page's "Download invoice" link points here instead. Served inline so
// the PDF opens in a tab (admin can print or save from there).
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 403 });
  }

  const { id } = await params;

  try {
    const pdf = await regenerateInvoicePdf(id);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="invoice-${id}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    console.error(`[admin invoice pdf] regeneration failed for order ${id}:`, err);
    // Only ActionError messages are safe to show an admin verbatim — route
    // handlers don't get Next's server-action digest masking, so anything
    // else (DB hiccup, PDF-lib exception) must stay generic.
    if (err instanceof ActionError) {
      // "not found" / "no invoice number" style errors → 404, anything else → 500
      const status = /not found|no invoice/i.test(err.message) ? 404 : 500;
      return NextResponse.json({ error: err.message }, { status });
    }
    return NextResponse.json(
      { error: "Something went wrong — please try again" },
      { status: 500 },
    );
  }
}
