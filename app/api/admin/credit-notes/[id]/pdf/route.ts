import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/actions/auth";
import { getCreditNoteDataById } from "@/lib/db/queries/credit-notes";
import { generateCreditNotePdf } from "@/lib/credit-note/generate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/credit-notes/[id]/pdf
//
// Same reasoning as /api/admin/orders/[id]/invoice.pdf — server actions
// can't stream a binary Buffer, so the admin order page's "Download credit
// note" link points here instead. Served inline so it opens in a tab.
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
    const data = await getCreditNoteDataById(id);
    if (!data) {
      return NextResponse.json({ error: "Credit note not found" }, { status: 404 });
    }

    const pdf = await generateCreditNotePdf(data);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="credit-note-${data.creditNoteNumber.replace(/\//g, "-")}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    console.error(`[admin credit note pdf] generation failed for ${id}:`, err);
    return NextResponse.json(
      { error: "Something went wrong — please try again" },
      { status: 500 },
    );
  }
}
