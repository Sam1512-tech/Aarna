"use client";

import { useState } from "react";
import { Film, Loader2, Trash2, RefreshCw } from "lucide-react";
import { TextInput } from "@/components/admin/admin-form";
import {
  isWidgetConfigured,
  openCloudinaryWidget,
} from "@/lib/cloudinary/widget-client";

export interface CloudinaryVideoPickerProps {
  /** Currently-saved URL. `null` when there's no video yet. */
  value: string | null;
  onChange: (url: string | null) => void;
  /** Cloudinary folder for widget uploads, e.g. "aarna/homepage-videos". */
  folder?: string;
  label?: string;
  hint?: string;
}

/**
 * Video counterpart to `CloudinaryImagePicker` — same replace/remove
 * affordance, but deliberately narrower:
 *
 * There's no native-file-input fallback here. The image picker can fall
 * back to a real OS file picker because `/api/admin/uploads/image` exists
 * to receive it; no equivalent server route exists for video, and
 * deliberately so — video files routinely exceed what a Vercel serverless
 * function request body can carry, so a server-proxied upload would be
 * unreliable for real-world file sizes. The Cloudinary Upload Widget's
 * browser-to-Cloudinary path has no such limit (it never touches our
 * functions), so it's the *only* upload path offered here.
 *
 * When the widget isn't configured (`NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` /
 * `NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET` unset), this falls back to the
 * same manual URL-paste field homepage-videos already used — no regression,
 * just no upgrade until the widget is configured.
 */
export function CloudinaryVideoPicker({
  value,
  onChange,
  folder = "aarna/admin",
  label = "Video",
  hint,
}: CloudinaryVideoPickerProps) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const configured = isWidgetConfigured();

  async function pick() {
    setError(null);
    setPending(true);
    try {
      const result = await openCloudinaryWidget({
        folder,
        resourceType: "video",
        showBrowse: true,
      });
      if (result) onChange(result.url);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Upload failed — try again",
      );
    } finally {
      setPending(false);
    }
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
        {value && configured ? (
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

      {configured ? (
        <>
          <div className="relative mt-3 aspect-video w-full max-w-sm overflow-hidden rounded-2xl border border-cocoa/16 bg-cocoa/4">
            {value ? (
              <>
                <video
                  src={value}
                  className="h-full w-full object-cover"
                  muted
                  playsInline
                  controls
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
                    <Film className="h-6 w-6" aria-hidden="true" />
                    <span className="text-[11px] uppercase tracking-[0.18em]">
                      add video
                    </span>
                  </>
                )}
              </button>
            )}
          </div>
          {error ? (
            <p className="mt-2 text-xs text-burnt-red">{error}</p>
          ) : (
            <p className="mt-2 text-[10px] uppercase tracking-[0.14em] text-charcoal/40">
              MP4 · MOV · WEBM · 100 MB max
            </p>
          )}
        </>
      ) : (
        <>
          <TextInput
            type="url"
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value || null)}
            placeholder="https://res.cloudinary.com/…/video/upload/…"
            className="mt-3"
          />
          <p className="mt-2 text-[10px] uppercase tracking-[0.14em] text-charcoal/40">
            paste a cloudinary video url — direct upload needs the widget
            configured
          </p>
        </>
      )}
    </div>
  );
}
