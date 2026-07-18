/**
 * Client-side wrapper around POST /api/uploads/return-photo — the
 * `uploadPhoto` prop ReturnPhotoUploader expects.
 */
export async function uploadReturnPhoto(file: File): Promise<{ url: string }> {
  const body = new FormData();
  body.set("file", file);

  const res = await fetch("/api/uploads/return-photo", { method: "POST", body });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error ?? "Upload failed — try again");
  }
  return res.json();
}
