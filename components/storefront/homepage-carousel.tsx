"use client";

import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { isVideoUrl } from "@/lib/media";

// Minimal shape — keeps the component decoupled from the Drizzle Banner type
// and easy to mock. The server page maps DB rows into this shape.
export interface CarouselBanner {
  id: string;
  imageUrl: string;
  mobileImageUrl: string | null;
  title: string | null;
  subtitle: string | null;
  ctaLabel: string | null;
  ctaHref: string | null;
}

interface HomepageCarouselProps {
  banners: CarouselBanner[];
  /**
   * "hero" — full-bleed top-of-page, clears the fixed header, overlays the
   *          brand tagline + Collections CTA on a contrast scrim.
   * "inline" — sits inside a content box (e.g. the "made to live in" section).
   *           No header padding, rounded corners, no tagline/CTA overlay.
   */
  variant?: "hero" | "inline";
  /** Tailwind class controlling height/aspect when variant="inline". */
  inlineClassName?: string;
  /**
   * For variant="inline" only. When true, renders edge-to-edge with no
   * rounded corners or shadow — for using the inline carousel as a full-bleed
   * photo banner directly below the nav. Default: false (rounded box).
   */
  flush?: boolean;
}

const AUTOPLAY_MS = 6000;
const SWIPE_THRESHOLD_PX = 50;
const TAGLINE = "Clothing made to live softly";

export function HomepageCarousel({
  banners,
  variant = "hero",
  inlineClassName,
  flush = false,
}: HomepageCarouselProps) {
  // Empty state — graceful brand panel until the admin uploads banners.
  if (banners.length === 0) {
    return (
      <CarouselEmpty
        variant={variant}
        inlineClassName={inlineClassName}
        flush={flush}
      />
    );
  }
  return (
    <CarouselInner
      banners={banners}
      variant={variant}
      inlineClassName={inlineClassName}
      flush={flush}
    />
  );
}

function CarouselInner({
  banners,
  variant,
  inlineClassName,
  flush,
}: {
  banners: CarouselBanner[];
  variant: "hero" | "inline";
  inlineClassName?: string;
  flush: boolean;
}) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const indicatorId = useId();
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const videoRefs = useRef<Array<HTMLVideoElement | null>>([]);

  const count = banners.length;
  const isHero = variant === "hero";
  const inlineRound = flush
    ? "relative isolate overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-cocoa/40"
    : "relative isolate overflow-hidden rounded-[26px] shadow-[0_22px_60px_rgba(43,38,35,0.08)] outline-none focus-visible:ring-2 focus-visible:ring-cocoa/40";
  const sectionClass = isHero
    ? "paper-grain relative isolate overflow-hidden bg-cream pt-[128px] outline-none focus-visible:ring-2 focus-visible:ring-cocoa/40 md:pt-32"
    : inlineRound;
  const stageClass = isHero
    ? "relative mx-auto aspect-[4/5] w-full select-none touch-pan-y overflow-hidden md:aspect-[12/5]"
    : `relative mx-auto w-full select-none touch-pan-y overflow-hidden ${inlineClassName ?? "h-[260px] md:h-[420px]"}`;

  const go = useCallback(
    (next: number) => setActive(((next % count) + count) % count),
    [count],
  );
  const goPrev = useCallback(() => go(active - 1), [active, go]);
  const goNext = useCallback(() => go(active + 1), [active, go]);

  // Auto-advance. Skip while paused or while a video is the active slide
  // (videos signal end via the onEnded handler below instead).
  useEffect(() => {
    if (count <= 1 || paused) return;
    const activeBanner = banners[active];
    const desktopIsVideo = isVideoUrl(activeBanner.imageUrl);
    const mobileIsVideo = activeBanner.mobileImageUrl
      ? isVideoUrl(activeBanner.mobileImageUrl)
      : desktopIsVideo;
    if (desktopIsVideo || mobileIsVideo) return;
    const t = window.setTimeout(goNext, AUTOPLAY_MS);
    return () => window.clearTimeout(t);
  }, [active, banners, count, paused, goNext]);

  // When the active slide changes, restart the matching video if any so the
  // "wait for video to finish before advancing" rule is honoured each cycle.
  useEffect(() => {
    videoRefs.current.forEach((v, i) => {
      if (!v) return;
      if (i === active) {
        v.currentTime = 0;
        const p = v.play();
        if (p && typeof p.catch === "function") p.catch(() => {});
      } else {
        v.pause();
      }
    });
  }, [active]);

  // Keyboard navigation when the carousel is focused.
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      goPrev();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      goNext();
    }
  }

  // Pointer drag / swipe — works for mouse and touch via pointer events.
  function handlePointerDown(e: ReactPointerEvent) {
    dragStart.current = { x: e.clientX, y: e.clientY };
    setPaused(true);
  }
  function handlePointerUp(e: ReactPointerEvent) {
    const start = dragStart.current;
    dragStart.current = null;
    setPaused(false);
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) > SWIPE_THRESHOLD_PX && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) goNext();
      else goPrev();
    }
  }

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Showcase"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      className={sectionClass}
    >
      {/* Stage */}
      <div
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => {
          dragStart.current = null;
          setPaused(false);
        }}
        className={stageClass}
      >
        {banners.map((banner, i) => (
          <Slide
            key={banner.id}
            banner={banner}
            isActive={i === active}
            isAdjacent={Math.abs(i - active) === 1 || i === 0}
            registerVideo={(el) => {
              videoRefs.current[i] = el;
            }}
            onVideoEnded={goNext}
          />
        ))}

        {/* Hero variant only: contrast scrim + tagline + Collections CTA. */}
        {isHero ? (
          <>
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-t from-charcoal/55 via-charcoal/10 to-transparent"
            />
            <div className="pointer-events-none absolute inset-0 z-20 flex items-end px-5 pb-16 md:items-center md:px-12 md:pb-0">
              <div className="pointer-events-auto max-w-2xl">
                <h1 className="font-display text-[40px] leading-[0.98] text-cream drop-shadow-[0_4px_18px_rgba(43,38,35,0.45)] md:text-[64px] lg:text-[80px]">
                  {TAGLINE}
                </h1>
                <Link
                  href="/shop"
                  className="mt-7 inline-flex items-center justify-center border border-cream/60 bg-cream/95 px-7 py-4 text-[11px] font-bold tracking-[0.24em] text-cocoa shadow-[0_14px_34px_rgba(43,38,35,0.18)] transition duration-1000 hover:bg-cream"
                >
                  <span className="text-cocoa">Shop the wardrobe</span>
                </Link>
              </div>
            </div>
          </>
        ) : null}

        {/* Prev / Next */}
        {count > 1 ? (
          <>
            <button
              type="button"
              onClick={goPrev}
              aria-label="Previous slide"
              className="absolute left-3 top-1/2 z-30 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-cream/40 bg-cream/20 text-cream opacity-0 backdrop-blur-md transition duration-500 hover:bg-cream/35 group-hover:opacity-100 md:left-6 md:flex md:hover:opacity-100"
              style={{ opacity: 0.85 }}
            >
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={goNext}
              aria-label="Next slide"
              className="absolute right-3 top-1/2 z-30 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-cream/40 bg-cream/20 text-cream backdrop-blur-md transition duration-500 hover:bg-cream/35 md:right-6 md:flex"
              style={{ opacity: 0.85 }}
            >
              <ChevronRight className="h-5 w-5" aria-hidden="true" />
            </button>
          </>
        ) : null}

        {/* Dots + slide indicator */}
        {count > 1 ? (
          <div className="absolute inset-x-0 bottom-5 z-30 flex flex-col items-center gap-3 md:bottom-7">
            <div role="tablist" aria-label="Slides" className="flex items-center gap-2">
              {banners.map((_, i) => (
                <button
                  key={i}
                  role="tab"
                  type="button"
                  aria-label={`Go to slide ${i + 1}`}
                  aria-selected={i === active}
                  aria-controls={`${indicatorId}-${i}`}
                  onClick={() => go(i)}
                  className={`h-[6px] rounded-full transition-all duration-500 ${
                    i === active
                      ? "w-7 bg-cream"
                      : "w-[6px] bg-cream/55 hover:bg-cream/80"
                  }`}
                />
              ))}
            </div>
            <span className="text-[10px] font-medium uppercase tracking-[0.28em] text-cream/85 tabular-nums">
              {String(active + 1).padStart(2, "0")} / {String(count).padStart(2, "0")}
            </span>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function Slide({
  banner,
  isActive,
  isAdjacent,
  registerVideo,
  onVideoEnded,
}: {
  banner: CarouselBanner;
  isActive: boolean;
  isAdjacent: boolean;
  registerVideo: (el: HTMLVideoElement | null) => void;
  onVideoEnded: () => void;
}) {
  // Preload active + adjacent; lazy-load everything else.
  const eager = isActive || isAdjacent;

  return (
    <div
      aria-hidden={!isActive}
      className={`absolute inset-0 transition-opacity duration-1000 ease-[cubic-bezier(0.19,1,0.22,1)] ${
        isActive ? "opacity-100" : "opacity-0"
      }`}
    >
      {/* Mobile media (separate source when provided) */}
      <div className="absolute inset-0 md:hidden">
        <Media
          src={banner.mobileImageUrl ?? banner.imageUrl}
          alt={banner.title ?? "Aarna"}
          eager={eager}
          isActive={isActive}
          registerVideo={registerVideo}
          onVideoEnded={onVideoEnded}
        />
      </div>
      {/* Desktop media */}
      <div className="absolute inset-0 hidden md:block">
        <Media
          src={banner.imageUrl}
          alt={banner.title ?? "Aarna"}
          eager={eager}
          isActive={isActive}
          registerVideo={registerVideo}
          onVideoEnded={onVideoEnded}
        />
      </div>

      {/* Editorial CTA overlay — vertically centered, left-aligned. Renders
          only when the admin has set a destination on this banner (ctaHref);
          a missing label falls back to a sensible default so a slide never
          ships with a broken button. A left-to-right scrim (charcoal fading
          into transparent across the left ~60%) keeps the copy legible on
          any photo without dimming the rest of the image. */}
      {banner.ctaHref ? (
        <div className="pointer-events-none absolute inset-0 flex items-center">
          <div
            aria-hidden="true"
            className="absolute inset-y-0 left-0 w-3/5 bg-gradient-to-r from-charcoal/55 via-charcoal/20 to-transparent"
          />
          <div className="relative flex w-full flex-col items-start gap-5 px-6 py-10 sm:gap-6 sm:px-10 md:max-w-[620px] md:px-14 lg:px-20">
            {banner.title ? (
              <p className="text-xs font-medium uppercase tracking-[0.32em] text-cream/90 drop-shadow-[0_2px_10px_rgba(43,38,35,0.5)] sm:text-sm">
                {banner.title}
              </p>
            ) : null}
            {banner.subtitle ? (
              <h2 className="max-w-xl font-display text-5xl leading-[1.02] text-cream drop-shadow-[0_4px_18px_rgba(43,38,35,0.5)] sm:text-6xl lg:text-7xl">
                {banner.subtitle}
              </h2>
            ) : null}
            <Link
              href={banner.ctaHref}
              tabIndex={isActive ? 0 : -1}
              aria-hidden={!isActive}
              className="pointer-events-auto mt-1 inline-flex min-h-[52px] items-center gap-2 rounded-2xl border border-cream/60 bg-cream/95 px-7 text-[11px] font-bold uppercase tracking-[0.24em] text-cocoa shadow-[0_14px_34px_rgba(43,38,35,0.22)] transition duration-700 hover:bg-cream hover:-translate-y-0.5 active:translate-y-0"
            >
              {banner.ctaLabel ?? "the first chapter"}
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Media({
  src,
  alt,
  eager,
  isActive,
  registerVideo,
  onVideoEnded,
}: {
  src: string;
  alt: string;
  eager: boolean;
  isActive: boolean;
  registerVideo: (el: HTMLVideoElement | null) => void;
  onVideoEnded: () => void;
}) {
  if (isVideoUrl(src)) {
    return (
      <video
        ref={(el) => {
          if (isActive) registerVideo(el);
        }}
        className="h-full w-full object-cover"
        src={src}
        muted
        playsInline
        loop={false}
        autoPlay={isActive}
        preload={eager ? "auto" : "metadata"}
        onEnded={() => {
          if (isActive) onVideoEnded();
        }}
      />
    );
  }
  return (
    <Image
      src={src}
      alt={alt}
      fill
      priority={eager}
      sizes="(min-width: 768px) 100vw, 100vw"
      className="object-cover"
    />
  );
}

function CarouselEmpty({
  variant,
  inlineClassName,
  flush,
}: {
  variant: "hero" | "inline";
  inlineClassName?: string;
  flush: boolean;
}) {
  if (variant === "inline") {
    const round = flush
      ? ""
      : "rounded-[26px] shadow-[0_22px_60px_rgba(43,38,35,0.08)]";
    return (
      <div
        className={`cloth-window ${round} ${inlineClassName ?? "h-[260px] md:h-[420px]"}`}
        aria-label="Showcase placeholder"
      />
    );
  }
  return (
    <section className="paper-grain relative isolate overflow-hidden bg-cream pt-[128px] md:pt-32">
      <div className="relative mx-auto aspect-[4/5] w-full md:aspect-[12/5]">
        <div className="cloth-window absolute inset-0" />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-charcoal/40 via-charcoal/5 to-transparent"
        />
        <div className="absolute inset-0 flex items-end px-5 pb-16 md:items-center md:px-12 md:pb-0">
          <div className="max-w-2xl">
            <h1 className="font-display text-[40px] leading-[0.98] text-maroon md:text-[64px] lg:text-[80px]">
              {TAGLINE}
            </h1>
            <Link
              href="/shop"
              className="mt-7 inline-flex items-center justify-center border border-cocoa/24 bg-cream px-7 py-4 text-[11px] font-bold tracking-[0.24em] text-cocoa shadow-[0_14px_34px_rgba(140,106,90,0.14)] transition duration-1000 hover:bg-cocoa/12"
            >
              <span className="text-cocoa">Shop the wardrobe</span>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
