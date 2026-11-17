/**
 * Browser-side shrinker for photos headed to our own upload routes
 * (/api/admin/uploads/image, /api/uploads/return-photo).
 *
 * Why this exists: those routes run as Vercel functions, and Vercel rejects any
 * request body over 4.5 MB (HTTP 413 FUNCTION_PAYLOAD_TOO_LARGE, a plain-text
 * reply, before our code even runs — on every plan). The forms used to promise
 * 5–8 MB, so an ordinary phone or camera photo failed with only a generic
 * "Upload failed". Shrinking in the browser keeps big photos working AND keeps
 * what is stored on Cloudinary small: smaller originals mean less storage and
 * less bandwidth for every later fetch, which matters on the Free plan (a hard
 * credit cap — see the July 2026 bandwidth overage).
 *
 * A photo that is already small enough is sent untouched, exactly as before.
 * Plain module (no "use server"/"use client"): the server routes import
 * UPLOAD_MAX_BYTES from here so the limit has one source. The DOM calls only
 * run inside prepareImageForUpload, which is only ever called in the browser.
 */

/** What the server routes accept. Under Vercel's 4.5 MB body cap, with margin for multipart overhead. */
export const UPLOAD_MAX_BYTES = 4 * 1024 * 1024;

/** Largest original a person may pick — it gets shrunk, so this only guards against decoding something absurd. */
export const MAX_ORIGINAL_BYTES = 30 * 1024 * 1024;

/** Files at or under this are sent as they are. */
const SHRINK_ABOVE_BYTES = 3.5 * 1024 * 1024;
/** What a shrunk file must come in under (below UPLOAD_MAX_BYTES, for margin). */
const TARGET_BYTES = 3.5 * 1024 * 1024;
/** Longest side of a shrunk photo. Product pages show photos at ~1200 px wide at most. */
const MAX_EDGE_PX = 2400;
const JPEG_QUALITIES = [0.85, 0.78, 0.7, 0.62, 0.55];
const MAX_SIZE_ROUNDS = 4;

/** Shown when the host rejects a body as too large (HTTP 413 arrives as plain text, not our JSON). */
export const UPLOAD_TOO_LARGE_MESSAGE =
  "This photo is too large to upload (limit 4 MB) — resize it and try again.";

export const SHRINK_FAILED_MESSAGE =
  "We couldn't shrink this photo — please export it as a JPG under 4 MB and try again.";

export function needsShrinking(sizeBytes: number): boolean {
  return sizeBytes > SHRINK_ABOVE_BYTES;
}

/** Scales (width, height) down so the longest side is at most maxEdge; never scales up. */
export function fitWithin(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** "IMG_0042.HEIC" → "IMG_0042.jpg" */
export function shrunkName(name: string): string {
  const base = name.replace(/\.[^./\\]+$/, "");
  return `${base || "photo"}.jpg`;
}

async function decode(file: File): Promise<{
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}> {
  try {
    // "from-image" applies the photo's EXIF rotation, so a portrait phone photo
    // doesn't come out sideways.
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      release: () => bitmap.close(),
    };
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("decode failed"));
        img.src = url;
      });
      return {
        source: img,
        width: img.naturalWidth,
        height: img.naturalHeight,
        release: () => URL.revokeObjectURL(url),
      };
    } catch (err) {
      URL.revokeObjectURL(url);
      throw err;
    }
  }
}

function toJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

/**
 * Returns the file to upload: the same File if it's small enough, otherwise a
 * JPEG scaled to at most 2400 px on its longest side and under ~3.5 MB.
 * Throws an Error with a message fit to show the user if it can't be done.
 */
export async function prepareImageForUpload(file: File): Promise<File> {
  if (!needsShrinking(file.size)) return file;

  let decoded: Awaited<ReturnType<typeof decode>>;
  try {
    decoded = await decode(file);
  } catch {
    throw new Error(SHRINK_FAILED_MESSAGE);
  }

  try {
    let { width, height } = fitWithin(decoded.width, decoded.height, MAX_EDGE_PX);
    const canvas = document.createElement("canvas");

    for (let round = 0; round < MAX_SIZE_ROUNDS; round++) {
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) break;
      // JPEG has no transparency — put the image on white rather than black.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(decoded.source, 0, 0, width, height);

      for (const quality of JPEG_QUALITIES) {
        const blob = await toJpegBlob(canvas, quality);
        if (blob && blob.size <= TARGET_BYTES) {
          return new File([blob], shrunkName(file.name), {
            type: "image/jpeg",
            lastModified: Date.now(),
          });
        }
      }
      // Still too big even at the lowest quality — scale down and try again.
      width = Math.max(1, Math.round(width * 0.85));
      height = Math.max(1, Math.round(height * 0.85));
    }
    throw new Error(SHRINK_FAILED_MESSAGE);
  } finally {
    decoded.release();
  }
}
