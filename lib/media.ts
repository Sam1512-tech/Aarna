/**
 * Media-type helpers shared by server actions and client components.
 *
 * Product/banner media lives on Cloudinary. Videos are stored alongside
 * images (same `product_images` / banner url columns), so display code needs
 * to tell them apart and, for thumbnails, derive a poster frame.
 */

/** Video detection: extension or Cloudinary "/video/upload/" path. */
export function isVideoUrl(url: string): boolean {
  return (
    /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url) || /\/video\/upload\//i.test(url)
  );
}

/**
 * Poster frame for a Cloudinary video URL — swapping the file extension to
 * .jpg makes Cloudinary render the first frame as an image. Non-video URLs
 * are returned unchanged. Cloudinary public IDs are often extensionless
 * (format left to f_auto/inference) rather than ending in .mp4 — for those,
 * appending .jpg works the same way instead of a swap.
 */
export function videoPosterUrl(url: string): string {
  if (!isVideoUrl(url)) return url;
  if (/\.(mp4|webm|mov|m4v)(\?.*)?$/i.test(url)) {
    return url.replace(/\.(mp4|webm|mov|m4v)(\?.*)?$/i, ".jpg$2");
  }
  const [base, query] = url.split(/(\?.*)$/);
  return `${base}.jpg${query ?? ""}`;
}

// Field-tested against this project's real Cloudinary account (some
// combinations silently truncated playback to ~1s instead of erroring) —
// f_auto:video is required, not just f_auto, and c_limit keeps the width
// cap from ever upscaling or cropping a smaller source. w_720 comfortably
// covers every video panel on the site (none render wider on-screen), so a
// 4K+ source is scaled down before it ever leaves Cloudinary.
const VIDEO_TRANSFORM = "f_auto:video,q_auto,vc_auto,w_720,c_limit";

/**
 * Applies the same kind of automatic optimization to a Cloudinary video URL
 * that this codebase already relies on for images — without it, a raw
 * pasted/uploaded video streams the original file byte-for-byte to every
 * autoplaying visitor. A single 50MB+ homepage video, hit by ~100k visitors
 * over an Instagram-driven traffic spike, is what turned into a 3,182%
 * Cloudinary bandwidth overage in one billing cycle. Only touches genuine
 * Cloudinary "/video/upload/" delivery URLs; anything else is returned
 * unchanged, so it's safe to apply at every render site rather than relying
 * on whoever pastes a URL to remember to optimize it themselves.
 */
export function optimizedVideoUrl(url: string): string {
  const marker = "/video/upload/";
  const idx = url.indexOf(marker);
  if (idx === -1) return url;
  const cut = idx + marker.length;
  // Already carries this exact transform (e.g. an admin pasted a
  // pre-transformed URL, like the two homepage videos manually fixed
  // during the July overage) — don't stack a second copy.
  if (url.startsWith(VIDEO_TRANSFORM, cut)) return url;
  return `${url.slice(0, cut)}${VIDEO_TRANSFORM}/${url.slice(cut)}`;
}
