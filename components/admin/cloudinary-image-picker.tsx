"use client";

import { useRef, useState, useTransition } from "react";
import { ImagePlus, Loader2, Trash2, RefreshCw } from "lucide-react";
import {
  isWidgetConfigured,
  openCloudinaryWidget,
} from "@/lib/cloudinary/widget-client";

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB per image — matches /api/admin/uploads/image's own cap
const ACCEPT = "image/jpeg,image/png,image/webp,image/avif";

/**
 * Upload contract every admin image-picker instance takes. Points at a
 * signed Cloudinary upload endpoint (`uploadAdminImage` in
 * `lib/cloudinary/upload-client.ts`, backed by `/api/admin/uploads/image`)
 * and must return `{ url: string }` — the final Cloudinary URL to store on
 * whatever column the caller owns (`categories.imageUrl`, `banners.imageUrl`,
 * `collections.heroImageUrl`, `product_images.url`, …).
 */
export type UploadImageFn = (file: File) => Promise<{ url: string }>;

export interface CloudinaryImagePickerProps {
  /** Currently-saved URL. `null` when there's no image yet. */
  value: string | null;
  onChange: (url: string | null) => void;
  uploadImage: UploadImageFn;
  /**
   * Aspect ratio to preview/crop at, as `"width/height"` (e.g. `"4/5"`,
   * `"12/5"`, `"1/1"`). Applied as a real CSS `aspect-ratio` (not a Tailwind
   * class) so callers aren't limited to a hardcoded set of ratios — every
   * resource that uses this picker has a different natural shape (category
   * tiles are 4:5 portrait, banners are ~12:5 wide, product photos are 4:5).
   * Also passed to the Cloudinary widget as the crop guide.
   */
  aspect?: string;
  label?: string;
  hint?: string;
  /** Cloudinary folder for widget + server uploads, e.g. "aarna/banners". */
  folder?: string;
}

/**
 * Single-image picker shared by every admin form that stores a Cloudinary
 * image URL: category tiles, banner desktop/mobile images, collection hero
 * images, and (in "always empty" add-mode — pass `value={null}` and handle
 * persistence in `onChange`) each image in a product's gallery. Handles
 * upload, preview, replace, and remove. Pure presentation — every
 * side-effect goes through props.
 *
 * Typical wiring:
 *
 *   <CloudinaryImagePicker
 *     value={banner.imageUrl}
 *     onChange={(url) => setImageUrl(url ?? "")}
 *     uploadImage={(file) => uploadAdminImage(file, "aarna/banners")}
 *     aspect="12/5"
 *   />
 */
export function CloudinaryImagePicker({
  value,
  onChange,
  uploadImage,
  aspect = "4/5",
  label = "Image",
  hint,
  folder = "aarna/admin",
}: CloudinaryImagePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [aw, ah] = aspect.split("/").map(Number);
  const aspectStyle =
    Number.isFinite(aw) && Number.isFinite(ah) && aw > 0 && ah > 0
      ? { aspectRatio: `${aw} / ${ah}` }
      : undefined;

  /**
   * Try the Cloudinary Upload Widget first (branded UI, drag-drop, URL
   * paste, camera, library browse). Falls back to the OS file picker if:
   *   - Env vars aren't set (widget not configured for this deploy)
   *   - The widget script fails to load (network blocked, etc.)
   *   - The widget throws mid-upload
   * The native fallback still uploads to Cloudinary via the server route
   * — no path leaves images off Cloudinary.
   */
  async function pick() {
    setError(null);
    if (!isWidgetConfigured()) {
      inputRef.current?.click();
      return;
    }
    try {
      const cropAspectRatio = aspect.replace("/", ":");
      const result = await openCloudinaryWidget({
        folder,
        cropAspectRatio,
        showBrowse: true,
      });
      if (result) {
        onChange(result.url);
      }
    } catch (err) {
      console.warn("[cloudinary-image-picker] widget failed, falling back", err);
      inputRef.current?.click();
    }
  }

  async function handleFile(file: File | null | undefined) {
    if (!file) return;
    setError(null);

    if (!ACCEPT.includes(file.type)) {
      setError("Please pick a JPG, PNG, WEBP, or AVIF image");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(`${file.name} is over 8 MB`);
      return;
    }

    startTransition(async () => {
      try {
        const { url } = await uploadImage(file);
        onChange(url);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Upload failed — try again",
        );
      }
    });
  }

  function clear() {
    setError(null);
    onChange(null);
  }

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-charcoal/55">
          {label}
        </p>
        {value ? (
          <div className="flex items-center gap-3 text-[10px] uppercase tracking-[0.14em]">
            <button
              type="button"
              onClick={pick}
              disabled={pending}
              className="inline-flex min-h-10 items-center gap-1 rounded-md px-2 py-2 text-cocoa transition hover:text-maroon disabled:opacity-50"
            >
              <RefreshCw className="h-3 w-3" aria-hidden="true" />
              replace
            </button>
            <button
              type="button"
              onClick={clear}
              disabled={pending}
              className="inline-flex min-h-10 items-center gap-1 rounded-md px-2 py-2 text-burnt-red transition hover:text-burnt-red/80 disabled:opacity-50"
            >
              <Trash2 className="h-3 w-3" aria-hidden="true" />
              remove
            </button>
          </div>
        ) : null}
      </div>
      {hint ? (
        <p className="mt-1 text-xs leading-5 text-charcoal/60">{hint}</p>
      ) : null}

      <div
        style={aspectStyle}
        className="relative mt-3 w-full max-w-xs overflow-hidden rounded-2xl border border-cocoa/16 bg-cocoa/4"
      >
        {value ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={value}
              alt={label}
              className="h-full w-full object-cover"
            />
            {pending ? (
              <div className="absolute inset-0 flex items-center justify-center bg-charcoal/40 backdrop-blur-sm">
                <Loader2
                  className="h-6 w-6 animate-spin text-cream"
                  aria-hidden="true"
                />
              </div>
            ) : null}
          </>
        ) : (
          <button
            type="button"
            onClick={pick}
            disabled={pending}
            className="flex h-full w-full flex-col items-center justify-center gap-2 border border-dashed border-cocoa/25 bg-cream text-cocoa transition duration-500 hover:border-cocoa hover:bg-cocoa/6 disabled:cursor-wait disabled:opacity-50"
          >
            {pending ? (
              <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
            ) : (
              <>
                <ImagePlus className="h-6 w-6" aria-hidden="true" />
                <span className="text-[11px] uppercase tracking-[0.18em]">
                  {pending ? "uploading…" : "add image"}
                </span>
              </>
            )}
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        hidden
        onChange={(e) => {
          void handleFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      {error ? (
        <p className="mt-2 text-xs text-burnt-red">{error}</p>
      ) : (
        <p className="mt-2 text-[10px] uppercase tracking-[0.14em] text-charcoal/40">
          JPG · PNG · WEBP · AVIF · 8 MB max · portrait works best
        </p>
      )}
    </div>
  );
}
