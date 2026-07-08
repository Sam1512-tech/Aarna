import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/actions/auth";
import {
  generateHangTagsForVariants,
  type HangTagPrintItem,
} from "@/lib/actions/admin/labels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/hang-tags/print
//
// Body: { items: { variantId: string; quantity: number }[] }
//
// Shared by two UIs: the per-product "sizes & tags" print panel (checkbox +
// quantity per tag) and the barcode-scan reprint queue on /admin/inventory
// (a damaged tag can belong to any product, so that queue isn't scoped to
// one product id the way the GET hang-tags.pdf route is).
export async function POST(req: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 403 });
  }

  let body: { items?: HangTagPrintItem[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length === 0) {
    return NextResponse.json({ error: "no items to print" }, { status: 400 });
  }

  try {
    const pdf = await generateHangTagsForVariants(items);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="hang-tags.pdf"',
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "hang tag generation failed";
    const status = /not found|no matching|no items|pick at least/i.test(message)
      ? 400
      : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
