import { NextResponse } from "next/server";
import { getCurrentCustomer } from "@/lib/actions/auth";
import { uploadImageBuffer } from "@/lib/cloudinary/upload";
import { UPLOAD_MAX_BYTES } from "@/lib/images/prepare-upload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Vercel rejects request bodies over 4.5 MB before this route runs; the browser
// shrinks bigger photos first (lib/images/prepare-upload.ts).
const MAX_BYTES = UPLOAD_MAX_BYTES;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

// POST /api/uploads/return-photo
//
// Customer-authenticated (any signed-in customer, not just the one who owns
// the order being returned — requestReturn itself re-checks orderItemId
// ownership before a photo URL is ever persisted, so an uploaded-but-unused
// photo from someone poking this endpoint is harmless). multipart/form-data:
// `file`. Returns { url }.
export async function POST(req: Request) {
  const customer = await getCurrentCustomer().catch(() => null);
  if (!customer) {
    return NextResponse.json({ error: "Please sign in" }, { status: 401 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: "File must be jpg, png, or webp" },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File is over 4 MB" }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const { url } = await uploadImageBuffer(buffer, "aarna/returns");
    return NextResponse.json({ url });
  } catch (err) {
    console.error("[uploads/return-photo] Cloudinary upload failed:", err);
    return NextResponse.json(
      { error: "Upload failed — try again" },
      { status: 502 },
    );
  }
}
