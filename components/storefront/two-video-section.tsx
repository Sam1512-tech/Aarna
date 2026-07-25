import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { PublicVideoSlot } from "@/lib/actions/banners";

interface TwoVideoSectionProps {
  left: PublicVideoSlot | null;
  right: PublicVideoSlot | null;
  /**
   * Tailwind aspect-ratio class per panel (e.g. "aspect-[4/5]"). The
   * videos here are portrait, so the panel's shape needs to match the
   * source instead of a fixed landscape-ish height that crops it badly.
   * Defaults to a portrait ratio.
   */
  aspectClassName?: string;
}

/**
 * The "made to live in" homepage section — two fixed video slots, side by
 * side on desktop and stacked on mobile. A slot with no video configured yet
 * (or turned inactive) shows the site's standard `cloth-window` placeholder
 * instead of ever rendering dead blank space. Sized by aspect-ratio (not a
 * fixed height) so a portrait video isn't cropped down to a landscape box.
 */
export function TwoVideoSection({
  left,
  right,
  aspectClassName,
}: TwoVideoSectionProps) {
  return (
    <div className="grid gap-5 md:grid-cols-2 md:gap-6">
      <VideoPanel slot={left} aspectClassName={aspectClassName} />
      <VideoPanel slot={right} aspectClassName={aspectClassName} />
    </div>
  );
}

function VideoPanel({
  slot,
  aspectClassName,
}: {
  slot: PublicVideoSlot | null;
  aspectClassName?: string;
}) {
  return (
    <div
      className={`relative isolate overflow-hidden rounded-[26px] shadow-[0_22px_60px_rgba(43,38,35,0.08)] ${
        // 4:5 — matches the source portrait video exactly (1080x1350, changed
        // from the earlier 1080x1920/9:16 spec) at every breakpoint, so
        // object-cover has nothing to crop.
        aspectClassName ?? "aspect-[4/5]"
      }`}
    >
      {slot?.videoUrl ? (
        <video
          className="absolute inset-0 h-full w-full object-cover"
          src={slot.videoUrl}
          muted
          loop
          autoPlay
          playsInline
          preload="metadata"
        />
      ) : (
        <div className="cloth-window absolute inset-0" aria-label="Video placeholder" />
      )}

      {slot?.ctaHref ? (
        <div className="pointer-events-none absolute inset-0 flex items-end">
          <div
            aria-hidden="true"
            className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-charcoal/60 via-charcoal/15 to-transparent"
          />
          <div className="relative flex w-full flex-col items-start gap-3 px-6 py-8 sm:px-8">
            {slot.title ? (
              <p className="text-xs font-medium uppercase tracking-[0.28em] text-cream/90 drop-shadow-[0_2px_10px_rgba(43,38,35,0.5)]">
                {slot.title}
              </p>
            ) : null}
            {slot.subtitle ? (
              <h3 className="max-w-md font-display text-3xl leading-[1.05] text-cream drop-shadow-[0_4px_18px_rgba(43,38,35,0.5)] sm:text-4xl">
                {slot.subtitle}
              </h3>
            ) : null}
            <Link
              href={slot.ctaHref}
              className="pointer-events-auto mt-1 inline-flex min-h-[46px] items-center gap-2 rounded-2xl border border-cream/60 bg-cream/95 px-6 text-[11px] font-bold uppercase tracking-[0.22em] text-cocoa shadow-[0_14px_34px_rgba(43,38,35,0.22)] transition duration-700 hover:bg-cream hover:-translate-y-0.5 active:translate-y-0"
            >
              {slot.ctaLabel ?? "Shop now"}
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
