"use client";

import { useRef, useState, useTransition } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";

const MAX_PHOTOS = 3;
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB per photo — matches Sam's PR 2 endpoint spec
const ACCEPT = "image/jpeg,image/png,image/webp";

/**
 * Upload function contract. PR 2 wires this to POST /api/uploads/return-photo,
 * which returns a Cloudinary URL. Local previews use URL.createObjectURL until
 * the real upload succeeds; only Cloudinary URLs are persisted with the return.
 */
export type UploadPhotoFn = (file: File) => Promise<{ url: string }>;

export interface ReturnPhotoUploaderProps {
  photos: string[];
  onChange: (photos: string[]) => void;
  uploadPhoto: UploadPhotoFn;
  required?: boolean;
  /** Copy shown above the uploader. Reason category drives this (e.g. "damaged" makes photos required with damage-specific copy). */
  hint?: string;
}

export function ReturnPhotoUploader({
  photos,
  onChange,
  uploadPhoto,
  required = false,
  hint,
}: ReturnPhotoUploaderProps) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function pick() {
    inputRef.current?.click();
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);

    const remaining = MAX_PHOTOS - photos.length;
    if (remaining <= 0) {
      setError(`Up to ${MAX_PHOTOS} photos`);
      return;
    }

    const chosen = Array.from(files).slice(0, remaining);
    for (const f of chosen) {
      if (f.size > MAX_BYTES) {
        setError(`${f.name} is over 5 MB`);
        return;
      }
      if (!ACCEPT.includes(f.type)) {
        setError(`${f.name} isn't JPG / PNG / WEBP`);
        return;
      }
    }

    startTransition(async () => {
      const uploaded: string[] = [];
      for (const f of chosen) {
        try {
          const { url } = await uploadPhoto(f);
          uploaded.push(url);
        } catch (err) {
          setError(
            err instanceof Error ? err.message : "Upload failed — try again",
          );
          break;
        }
      }
      if (uploaded.length > 0) {
        onChange([...photos, ...uploaded]);
      }
    });
  }

  function remove(index: number) {
    onChange(photos.filter((_, i) => i !== index));
  }

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-charcoal/55">
          photos{required ? " (required)" : " (optional)"}
        </p>
        <p className="text-[10px] tabular-nums text-charcoal/45">
          {photos.length}/{MAX_PHOTOS}
        </p>
      </div>
      {hint ? (
        <p className="mt-1 text-xs leading-5 text-charcoal/60">{hint}</p>
      ) : null}

      <div className="mt-3 grid grid-cols-3 gap-2">
        {photos.map((url, i) => (
          <div
            key={url}
            className="group/tile relative aspect-square overflow-hidden rounded-xl border border-cocoa/12 bg-cocoa/4"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={`return evidence ${i + 1}`}
              className="h-full w-full object-cover"
            />
            <button
              type="button"
              onClick={() => remove(i)}
              aria-label={`remove photo ${i + 1}`}
              className="absolute right-1.5 top-1.5 inline-flex h-8 w-8 items-center justify-center rounded-full bg-charcoal/70 text-cream opacity-100 backdrop-blur-sm transition sm:opacity-0 sm:group-hover/tile:opacity-100 focus:opacity-100"
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          </div>
        ))}

        {photos.length < MAX_PHOTOS ? (
          <button
            type="button"
            onClick={pick}
            disabled={pending}
            className="flex aspect-square flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-cocoa/30 bg-cream text-cocoa transition duration-500 hover:border-cocoa hover:bg-cocoa/6 disabled:cursor-wait disabled:opacity-50"
          >
            {pending ? (
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            ) : (
              <>
                <ImagePlus className="h-5 w-5" aria-hidden="true" />
                <span className="text-[10px] uppercase tracking-[0.14em]">
                  add
                </span>
              </>
            )}
          </button>
        ) : null}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        hidden
        onChange={(e) => {
          void handleFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {error ? (
        <p className="mt-2 text-xs text-burnt-red">{error}</p>
      ) : (
        <p className="mt-2 text-[10px] uppercase tracking-[0.14em] text-charcoal/40">
          JPG · PNG · WEBP · 5 MB max
        </p>
      )}
    </div>
  );
}
