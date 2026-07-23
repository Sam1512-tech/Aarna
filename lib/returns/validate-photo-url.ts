import { ActionError } from "@/lib/action-error";

/**
 * requestReturn() (lib/actions/account.ts) is a server action any signed-in
 * customer can call directly with an arbitrary payload — not only via POST
 * /api/uploads/return-photo, whose file-type/size checks this bypasses
 * entirely. ReturnPhotoGrid (components/admin/return-photo-grid.tsx) renders
 * every `photos[]` entry unconditionally as <img src={url}>, so an
 * unvalidated URL lets a malicious customer plant a link to their own
 * server: the admin's browser fires a real request the moment they review
 * that return, leaking their IP/User-Agent and confirming exactly when it
 * was reviewed.
 *
 * Mirrors the validateUrl() pattern used in lib/actions/admin/banners.ts and
 * homepage-video-slots.ts, but stricter — those accept any absolute URL or
 * app-relative path; here we only ever expect a Cloudinary delivery URL
 * (uploadImageBuffer's `secure_url`), so anything that isn't actually one is
 * rejected outright.
 */
export function validateReturnPhotoUrl(
  input: string,
  cloudName: string | undefined,
): string {
  const trimmed = input.trim();
  if (!trimmed) throw new ActionError("Photo URL is required");
  if (trimmed.length > 2000) throw new ActionError("Photo URL is too long");

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new ActionError("Photo URL is invalid");
  }

  const expectedPrefix = cloudName ? `/${cloudName}/image/upload/` : null;
  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== "res.cloudinary.com" ||
    !expectedPrefix ||
    !parsed.pathname.startsWith(expectedPrefix)
  ) {
    throw new ActionError("Photo URL must be a valid Cloudinary image URL");
  }

  return trimmed;
}
