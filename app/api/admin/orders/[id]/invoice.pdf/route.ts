import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/actions/auth";
import { regenerateInvoicePdf } from "@/lib/actions/admin/orders";

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
    const message = err instanceof Error ? err.message : "invoice generation failed";
    // "not found" / "no invoice number" style errors → 404, anything else → 500
    const status = /not found|no invoice/i.test(message) ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
