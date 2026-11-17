import {
  UPLOAD_TOO_LARGE_MESSAGE,
  prepareImageForUpload,
} from "@/lib/images/prepare-upload";

/**
 * Client-side wrapper around POST /api/uploads/return-photo — the
 * `uploadPhoto` prop ReturnPhotoUploader expects.
 */
export async function uploadReturnPhoto(file: File): Promise<{ url: string }> {
  // Big photos are shrunk first — the host rejects request bodies over 4.5 MB.
  const body = new FormData();
  body.set("file", await prepareImageForUpload(file));

  const res = await fetch("/api/uploads/return-photo", { method: "POST", body });
  if (!res.ok) {
    if (res.status === 413) throw new Error(UPLOAD_TOO_LARGE_MESSAGE);
    const data = await res.json().catch(() => null);
    throw new Error(data?.error ?? "Upload failed — try again");
  }
  return res.json();
}
