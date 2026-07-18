import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/actions/auth";
import { uploadImageBuffer } from "@/lib/cloudinary/upload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];

// POST /api/admin/uploads/image
//
// Generic authenticated image upload for admin forms (category tiles today;
// same shape works for banners/products if their paste-a-URL fields ever
// grow a file picker). multipart/form-data: `file` + optional `folder`
// (defaults to a generic admin bucket; callers should pass something
// specific, e.g. "aarna/categories").
export async function POST(req: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: "File must be jpg, png, webp, or avif" },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "File is over 8 MB" },
      { status: 400 },
    );
  }

  const folderRaw = form?.get("folder");
  const folder =
    typeof folderRaw === "string" && /^aarna\/[a-z0-9/_-]+$/.test(folderRaw)
      ? folderRaw
      : "aarna/admin";

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const { url } = await uploadImageBuffer(buffer, folder);
    return NextResponse.json({ url });
  } catch (err) {
    console.error("[uploads/image] Cloudinary upload failed:", err);
    return NextResponse.json(
      { error: "Upload failed — try again" },
      { status: 502 },
    );
  }
}
