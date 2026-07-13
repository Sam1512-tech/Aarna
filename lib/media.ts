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
 * are returned unchanged.
 */
export function videoPosterUrl(url: string): string {
  if (!isVideoUrl(url)) return url;
  return url.replace(/\.(mp4|webm|mov|m4v)(\?.*)?$/i, ".jpg$2");
}
