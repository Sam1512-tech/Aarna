import {
  UPLOAD_TOO_LARGE_MESSAGE,
  prepareImageForUpload,
} from "@/lib/images/prepare-upload";

/**
 * Client-side wrapper around POST /api/admin/uploads/image — the
 * `uploadImage`/`uploadPhoto` prop every admin image-picker component
 * expects. Kept out of any one component so category, banner, and future
 * pickers all share the same upload path.
 */
export async function uploadAdminImage(
  file: File,
  folder: string,
): Promise<{ url: string }> {
  // Big photos are shrunk first — the host rejects request bodies over 4.5 MB.
  const body = new FormData();
  body.set("file", await prepareImageForUpload(file));
  body.set("folder", folder);

  const res = await fetch("/api/admin/uploads/image", { method: "POST", body });
  if (!res.ok) {
    if (res.status === 413) throw new Error(UPLOAD_TOO_LARGE_MESSAGE);
    const data = await res.json().catch(() => null);
    throw new Error(data?.error ?? "Upload failed — try again");
  }
  return res.json();
}
