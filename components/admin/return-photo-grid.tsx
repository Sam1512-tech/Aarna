"use client";

import { useState } from "react";
import { X } from "lucide-react";

export interface ReturnPhotoGridProps {
  photos: string[];
}

/**
 * Read-only photo grid for admin — customer evidence attached to a return
 * or exchange. Click opens a lightbox. Populated once Sam's PR 2 exposes
 * `returns.photos: string[]`.
 */
export function ReturnPhotoGrid({ photos }: ReturnPhotoGridProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (photos.length === 0) return null;

  return (
    <>
      <div className="mt-4">
        <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-charcoal/55">
          customer photos · {photos.length}
        </p>
        <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
          {photos.map((url, i) => (
            <button
              key={url}
              type="button"
              onClick={() => setLightboxIndex(i)}
              aria-label={`open photo ${i + 1}`}
              className="group/tile aspect-square overflow-hidden rounded-lg border border-cocoa/12 bg-cocoa/4 transition duration-500 hover:border-cocoa"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={`return evidence ${i + 1}`}
                className="h-full w-full object-cover transition duration-500 group-hover/tile:scale-105"
              />
            </button>
          ))}
        </div>
      </div>

      {lightboxIndex !== null ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`photo ${lightboxIndex + 1} of ${photos.length}`}
          className="fixed inset-0 z-[80] flex items-center justify-center bg-charcoal/80 p-6 backdrop-blur"
        >
          <button
            type="button"
            onClick={() => setLightboxIndex(null)}
            aria-label="close photo"
            className="absolute inset-0"
          />
          <button
            type="button"
            onClick={() => setLightboxIndex(null)}
            aria-label="close photo"
            className="absolute right-6 top-6 inline-flex h-10 w-10 items-center justify-center rounded-full bg-cream/12 text-cream backdrop-blur hover:bg-cream/20"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photos[lightboxIndex]}
            alt={`return evidence ${lightboxIndex + 1}`}
            className="relative z-10 max-h-[90vh] max-w-[90vw] rounded-xl object-contain shadow-[0_30px_80px_rgba(0,0,0,0.5)]"
          />
          {photos.length > 1 ? (
            <div className="absolute bottom-6 left-1/2 z-10 -translate-x-1/2 rounded-full bg-cream/12 px-4 py-1.5 text-xs uppercase tracking-[0.16em] text-cream backdrop-blur">
              {lightboxIndex + 1} / {photos.length}
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
