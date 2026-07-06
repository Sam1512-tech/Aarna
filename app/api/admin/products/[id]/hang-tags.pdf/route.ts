import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/actions/auth";
import { generateHangTagsForProduct } from "@/lib/actions/admin/labels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/products/[id]/hang-tags.pdf
//
// One 50×30mm page per variant of the product, with the Code 128 barcode.
// The admin product page's "Print tags" button opens this in a tab — from
// there the admin prints at 100% scale onto the label roll.
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
    const pdf = await generateHangTagsForProduct(id);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="hang-tags-${id}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "hang tag generation failed";
    const status = /not found|no variants/i.test(message) ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
