import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/actions/auth";
import { generateHangTagsForProduct } from "@/lib/actions/admin/labels";
import { ActionError } from "@/lib/action-error";

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
    console.error(`[admin hang-tags pdf] generation failed for product ${id}:`, err);
    // Only ActionError messages are safe to show an admin verbatim — route
    // handlers don't get Next's server-action digest masking, so anything
    // else (DB hiccup, barcode/PDF-lib exception) must stay generic.
    if (err instanceof ActionError) {
      const status = /not found|no variants/i.test(err.message) ? 404 : 500;
      return NextResponse.json({ error: err.message }, { status });
    }
    return NextResponse.json(
      { error: "Something went wrong — please try again" },
      { status: 500 },
    );
  }
}
