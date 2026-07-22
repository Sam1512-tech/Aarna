"use client";

import { useRef, useState, useTransition } from "react";
import { ImagePlus, Loader2, Trash2, RefreshCw } from "lucide-react";
import {
  isWidgetConfigured,
  openCloudinaryWidget,
} from "@/lib/cloudinary/widget-client";

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB per image (category tiles are shown large; give room for detail)
const ACCEPT = "image/jpeg,image/png,image/webp,image/avif";

/**
 * Upload contract. Sam wires this to a signed Cloudinary upload endpoint
 * (either a new `/api/uploads/category-image` or the existing banner uploader
 * — banner and category tiles share the same "large hero image" shape).
 * The endpoint must return `{ url: string }` where `url` is the final
 * Cloudinary URL to store on `categories.imageUrl`.
 */
export type UploadImageFn = (file: File) => Promise<{ url: string }>;

export interface CategoryImagePickerProps {
  /** Currently-saved URL. `null` while the category has no image yet. */
  value: string | null;
  onChange: (url: string | null) => void;
  uploadImage: UploadImageFn;
  /**
   * Aspect ratio to preview at. Category tiles on the homepage's
   * "wardrobe paths" grid are 4:5 portrait; that's the default here.
   */
  aspect?: "4/5" | "3/4" | "1/1" | "16/9";
  label?: string;
  hint?: string;
  /**
   * Cloudinary folder for widget uploads. Ignored when the widget isn't
   * configured (the native-picker fallback carries its own folder in the
   * `uploadImage` prop already).
   */
  folder?: string;
}

/**
 * Single-image picker for the admin category edit / new form. Handles upload,
 * preview, replace, and remove. Pure presentation — every side-effect goes
 * through the props so Sam can plug in the real upload/save actions in his PR.
 *
 * Suggested wiring in `/studio/categories/[id]/page.tsx` and
 * `/studio/categories/new/page.tsx`:
 *
 *   <CategoryImagePicker
 *     value={category.imageUrl ?? null}
 *     onChange={(url) => setField("imageUrl", url)}
 *     uploadImage={uploadCategoryImage}   // client-side wrapper around the
 *                                          // signed-upload route
 *   />
 *
 * Then include `imageUrl` in the `updateCategory` / `createCategory` payload.
 */
export function CategoryImagePicker({
  value,
  onChange,
  uploadImage,
  aspect = "4/5",
  label = "category image",
  hint,
  folder = "aarna/categories",
}: CategoryImagePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const aspectClass =
    aspect === "3/4"
      ? "aspect-[3/4]"
      : aspect === "1/1"
        ? "aspect-square"
        : aspect === "16/9"
          ? "aspect-video"
          : "aspect-[4/5]";

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
      console.warn("[category-image-picker] widget failed, falling back", err);
      inputRef.current?.click();
    }
  }

  async function handleFile(file: File | null | undefined) {
    if (!file) return;
    setError(null);

    if (!ACCEPT.includes(file.type)) {
      setError("please pick a jpg, png, webp, or avif image");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(`${file.name} is over 8 mb`);
      return;
    }

    startTransition(async () => {
      try {
        const { url } = await uploadImage(file);
        onChange(url);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "upload failed — try again",
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
        className={`relative mt-3 ${aspectClass} w-full max-w-xs overflow-hidden rounded-2xl border border-cocoa/16 bg-cocoa/4`}
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
          jpg · png · webp · avif · 8 mb max · portrait works best
        </p>
      )}
    </div>
  );
}
