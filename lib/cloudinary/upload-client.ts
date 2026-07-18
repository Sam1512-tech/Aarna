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
  const body = new FormData();
  body.set("file", file);
  body.set("folder", folder);

  const res = await fetch("/api/admin/uploads/image", { method: "POST", body });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error ?? "Upload failed — try again");
  }
  return res.json();
}
