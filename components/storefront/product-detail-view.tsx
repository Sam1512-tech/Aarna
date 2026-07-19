"use client";

import Image from "next/image";
import { createPortal } from "react-dom";
import { isVideoUrl, videoPosterUrl } from "@/lib/media";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Heart,
  Lock,
  Minus,
  Plus,
  Star,
  Truck,
  X,
  ZoomIn,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { addToCart, getCart } from "@/lib/actions/cart";
import { addToWishlist } from "@/lib/actions/account";
import { SizeGuideModal } from "@/components/storefront/size-guide-modal";
import { useCartCount } from "@/store/cart-count";
import type {
  ProductImage as DbProductImage,
  ProductWithVariants,
} from "@/lib/types";
import { formatINR } from "@/lib/utils";

interface ProductDetailViewProps {
  product: ProductWithVariants;
  reviewSummary?: { average: number; count: number };
}

const LOW_STOCK_THRESHOLD = 3;

export function ProductDetailView({
  product,
  reviewSummary,
}: ProductDetailViewProps) {
  const router = useRouter();

  // ── Variant resolution ─────────────────────────────────────────────────────
  const activeVariants = useMemo(
    () => product.variants.filter((v) => v.isActive),
    [product.variants],
  );
  const sizes = useMemo(
    () => uniqueOrdered(activeVariants.map((v) => v.size).filter(isString)),
    [activeVariants],
  );
  const colors = useMemo(
    () => uniqueOrdered(activeVariants.map((v) => v.color).filter(isString)),
    [activeVariants],
  );

  // Default selection: first in-stock variant if any, else first variant.
  const defaultVariant = useMemo(
    () =>
      activeVariants.find((v) => v.stock > 0) ?? activeVariants[0] ?? null,
    [activeVariants],
  );

  const [selectedSize, setSelectedSize] = useState<string | null>(
    defaultVariant?.size ?? null,
  );
  const [selectedColor, setSelectedColor] = useState<string | null>(
    defaultVariant?.color ?? null,
  );
  const [quantity, setQuantity] = useState(1);
  const [activeImageIdx, setActiveImageIdx] = useState(0);

  const resolvedVariant = useMemo(
    () =>
      activeVariants.find(
        (v) =>
          (selectedSize === null || v.size === selectedSize) &&
          (selectedColor === null || v.color === selectedColor),
      ) ?? null,
    [activeVariants, selectedSize, selectedColor],
  );

  // Image filtering: when a color is picked and we have images tagged with
  // that variantColor, show only those; otherwise show all.
  const filteredImages = useMemo(() => {
    const images = [...product.images].sort((a, b) => a.sortOrder - b.sortOrder);
    if (!selectedColor) return images;
    const forColor = images.filter(
      (i) => i.variantColor?.toLowerCase() === selectedColor.toLowerCase(),
    );
    return forColor.length > 0 ? forColor : images;
  }, [product.images, selectedColor]);

  // Clamp the active index so it stays valid when the filtered image list
  // shrinks (e.g. picking a colour with fewer images). Resetting on actual
  // colour change happens in the colour handler below — no useEffect needed.
  const safeActiveIdx = Math.min(
    activeImageIdx,
    Math.max(0, filteredImages.length - 1),
  );

  function isSizeAvailable(size: string): boolean {
    return activeVariants.some(
      (v) =>
        v.size === size &&
        v.stock > 0 &&
        (selectedColor === null || v.color === selectedColor),
    );
  }
  function isColorAvailable(color: string): boolean {
    return activeVariants.some(
      (v) =>
        v.color === color &&
        v.stock > 0 &&
        (selectedSize === null || v.size === selectedSize),
    );
  }

  const variantSelected =
    (sizes.length === 0 || selectedSize !== null) &&
    (colors.length === 0 || selectedColor !== null) &&
    resolvedVariant !== null;
  const inStock = !!resolvedVariant && resolvedVariant.stock > 0;
  const stockNote = !resolvedVariant
    ? null
    : !inStock
      ? "sold out — try another size or colour"
      : resolvedVariant.stock <= LOW_STOCK_THRESHOLD
        ? `only ${resolvedVariant.stock} left`
        : "in stock";

  const onSale =
    typeof product.mrp === "number" && product.mrp > product.basePrice;
  const displayPrice = resolvedVariant?.price ?? product.basePrice;

  // ── Add to bag / wishlist ──────────────────────────────────────────────────
  const [isPending, startTransition] = useTransition();
  const [bagFeedback, setBagFeedback] = useState<null | "added" | "error">(null);
  const [wished, setWished] = useState(false);
  const [wishError, setWishError] = useState<string | null>(null);
  const [sizeGuideOpen, setSizeGuideOpen] = useState(false);
  // Quantity of THIS exact variant (size + colour) already sitting in the
  // customer's bag — lets "add to bag" tell them it's already there instead
  // of silently incrementing with no feedback.
  const [cartQty, setCartQty] = useState(0);

  useEffect(() => {
    // No sync setState here for the "no variant selected" case — the render
    // below already hides the note when resolvedVariant is null, so there's
    // nothing to reset.
    if (!resolvedVariant) return;
    let cancelled = false;
    getCart().then((cart) => {
      if (cancelled) return;
      const line = cart.lines.find((l) => l.variantId === resolvedVariant.id);
      setCartQty(line?.quantity ?? 0);
    });
    return () => {
      cancelled = true;
    };
  }, [resolvedVariant]);

  const handleAddToBag = useCallback(() => {
    if (!resolvedVariant || !inStock || isPending) return;
    setBagFeedback(null);
    startTransition(async () => {
      try {
        const next = await addToCart(resolvedVariant.id, quantity);
        useCartCount.getState().set(next.itemCount);
        const line = next.lines.find((l) => l.variantId === resolvedVariant.id);
        setCartQty(line?.quantity ?? quantity);
        setBagFeedback("added");
        window.setTimeout(() => setBagFeedback(null), 2200);
      } catch {
        setBagFeedback("error");
        window.setTimeout(() => setBagFeedback(null), 2200);
      }
    });
  }, [inStock, isPending, quantity, resolvedVariant]);

  const handleWishlist = useCallback(() => {
    if (!resolvedVariant) return;
    setWishError(null);
    setWished((w) => !w); // optimistic
    startTransition(async () => {
      try {
        await addToWishlist(resolvedVariant.id);
      } catch {
        // Most likely "Unauthorized — please sign in".
        setWished(false);
        setWishError("sign in to save to wishlist");
        router.push(
          `/login/otp?next=${encodeURIComponent(`/product/${product.slug}`)}`,
        );
      }
    });
  }, [resolvedVariant, router, product.slug]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <section className="paper-grain min-h-screen bg-cream px-5 pb-20 pt-[128px] md:px-6 md:pt-36">
      <div className="mx-auto max-w-7xl">
        <Breadcrumb product={product} />

        <div className="mt-6 grid gap-10 md:mt-10 md:grid-cols-[1.05fr_0.95fr] lg:gap-16">
          {/* Gallery */}
          <Gallery
            images={filteredImages}
            activeIdx={safeActiveIdx}
            onSelect={setActiveImageIdx}
            altFallback={product.title}
          />

          {/* Info */}
          <div className="md:sticky md:top-36 md:self-start">
            <p className="text-sm font-bold uppercase tracking-[0.24em] text-cocoa">
              {product.category?.name ?? "Wardrobe"}
            </p>
            <h1 className="mt-3 font-display text-[40px] leading-[1.04] text-maroon md:text-5xl">
              {product.title}
            </h1>

            {reviewSummary && reviewSummary.count > 0 ? (
              <a
                href="#reviews"
                className="soft-link mt-3 inline-flex items-center gap-1.5 text-sm text-charcoal/70"
              >
                <Star className="h-4 w-4 fill-cocoa text-cocoa" aria-hidden="true" />
                <span className="font-medium text-charcoal">
                  {reviewSummary.average.toFixed(1)}
                </span>
                <span className="text-charcoal/50">
                  · {reviewSummary.count}{" "}
                  {reviewSummary.count === 1 ? "review" : "reviews"}
                </span>
              </a>
            ) : null}

            <div className="mt-5 flex items-baseline gap-3">
              <span className="text-2xl text-charcoal">
                {formatINR(displayPrice)}
              </span>
              {onSale ? (
                <>
                  <span className="text-base text-charcoal/45 line-through">
                    {formatINR(product.mrp!)}
                  </span>
                  <span className="rounded-full bg-burnt-red/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-burnt-red">
                    {Math.round(
                      ((product.mrp! - product.basePrice) / product.mrp!) * 100,
                    )}
                    % off
                  </span>
                </>
              ) : null}
            </div>
            <p className="mt-1 text-xs text-charcoal/50">
              Inclusive of all taxes
            </p>

            {/* Size picker */}
            {sizes.length > 0 ? (
              <fieldset className="mt-9">
                <legend className="mb-3 flex items-center justify-between gap-4 text-[11px] font-medium uppercase tracking-[0.18em] text-charcoal/65">
                  <span>Size</span>
                  {/* Opens the in-page size guide modal (measurement chart in
                      inches). Replaces the old /faq redirect so customers get
                      the answer without leaving the product page. */}
                  <button
                    type="button"
                    onClick={() => setSizeGuideOpen(true)}
                    className="soft-link text-[10px] tracking-[0.18em] text-cocoa"
                  >
                    Size guide
                  </button>
                </legend>
                <div className="flex flex-wrap gap-2">
                  {sizes.map((size) => {
                    const available = isSizeAvailable(size);
                    const selected = size === selectedSize;
                    return (
                      <button
                        key={size}
                        type="button"
                        onClick={() => setSelectedSize(size)}
                        disabled={!available}
                        aria-pressed={selected}
                        className={`min-w-12 rounded-full border px-4 py-2 text-sm uppercase tracking-wide transition duration-500 ${
                          selected
                            ? "border-maroon bg-maroon text-cream"
                            : available
                              ? "border-cocoa/24 bg-cream text-charcoal hover:border-cocoa"
                              : "cursor-not-allowed border-cocoa/12 bg-cocoa/5 text-charcoal/35 line-through"
                        }`}
                      >
                        {size}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            ) : null}

            {/* Colour picker */}
            {colors.length > 0 ? (
              <fieldset className="mt-7">
                <legend className="mb-3 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-charcoal/65">
                  <span>Colour</span>
                  {selectedColor ? (
                    <span className="font-normal tracking-normal text-charcoal/55">
                      · {selectedColor}
                    </span>
                  ) : null}
                </legend>
                <div className="flex flex-wrap gap-2">
                  {colors.map((color) => {
                    const available = isColorAvailable(color);
                    const selected = color === selectedColor;
                    return (
                      <button
                        key={color}
                        type="button"
                        onClick={() => {
                          setSelectedColor(color);
                          setActiveImageIdx(0);
                        }}
                        disabled={!available}
                        aria-pressed={selected}
                        aria-label={`Colour: ${color}`}
                        className={`relative h-10 w-10 rounded-full border transition duration-500 ${
                          selected
                            ? "border-maroon ring-2 ring-maroon/25 ring-offset-2 ring-offset-cream"
                            : available
                              ? "border-cocoa/22 hover:border-cocoa"
                              : "cursor-not-allowed border-cocoa/12 opacity-50"
                        }`}
                        style={{ backgroundColor: colorToCss(color) }}
                      />
                    );
                  })}
                </div>
              </fieldset>
            ) : null}

            {/* Quantity + stock */}
            <div className="mt-8 flex items-end justify-between gap-4">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-charcoal/65">
                  Quantity
                </p>
                <div className="mt-3 inline-flex items-center rounded-full border border-cocoa/22 bg-cream text-maroon shadow-[0_6px_18px_rgba(43,38,35,0.04)]">
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    disabled={quantity <= 1}
                    aria-label="Decrease quantity"
                    className="inline-flex h-11 w-11 items-center justify-center rounded-l-full transition duration-300 hover:bg-cocoa/8 hover:text-cocoa disabled:opacity-30"
                  >
                    <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  <span
                    key={quantity}
                    className="min-w-9 text-center text-sm tabular-nums"
                  >
                    {quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setQuantity((q) =>
                        Math.min(resolvedVariant?.stock ?? 10, q + 1),
                      )
                    }
                    disabled={
                      !resolvedVariant ||
                      quantity >= (resolvedVariant?.stock ?? 10)
                    }
                    aria-label="Increase quantity"
                    className="inline-flex h-11 w-11 items-center justify-center rounded-r-full transition duration-300 hover:bg-cocoa/8 hover:text-cocoa disabled:opacity-30"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
              {stockNote ? (
                <p
                  className={`pb-3 text-[11px] font-medium uppercase tracking-[0.16em] ${
                    !inStock
                      ? "text-burnt-red"
                      : (resolvedVariant?.stock ?? 0) <= LOW_STOCK_THRESHOLD
                        ? "text-burnt-red"
                        : "text-cocoa"
                  }`}
                >
                  {stockNote}
                </p>
              ) : null}
            </div>

            {resolvedVariant && cartQty > 0 ? (
              <p className="mt-3 text-[11px] font-medium uppercase tracking-[0.18em] text-cocoa">
                {cartQty} {cartQty === 1 ? "piece" : "pieces"} already in your bag
              </p>
            ) : null}

            {/* CTAs */}
            <div className="mt-8 flex items-stretch gap-2 md:gap-3">
              <button
                type="button"
                onClick={handleAddToBag}
                disabled={!variantSelected || !inStock || isPending}
                className="group/cta flex min-h-[48px] flex-1 items-center justify-center rounded-2xl bg-maroon px-4 shadow-[0_18px_40px_rgba(74,31,31,0.22)] transition duration-700 hover:bg-maroon/90 hover:shadow-[0_22px_52px_rgba(74,31,31,0.3)] disabled:opacity-45 disabled:hover:bg-maroon disabled:hover:shadow-[0_18px_40px_rgba(74,31,31,0.22)] md:min-h-[60px] md:px-6"
              >
                <span className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.2em] text-cream md:gap-3 md:text-[12px] md:tracking-[0.24em]">
                  {bagFeedback === "added"
                    ? "added to bag ✓"
                    : bagFeedback === "error"
                      ? "try again"
                      : !variantSelected
                        ? "select size & colour"
                        : !inStock
                          ? "sold out"
                          : isPending
                            ? "adding…"
                            : "add to bag"}
                </span>
              </button>
              <button
                type="button"
                onClick={handleWishlist}
                disabled={!variantSelected}
                aria-label={wished ? "Remove from wishlist" : "Add to wishlist"}
                aria-pressed={wished}
                className="flex h-[48px] w-[48px] shrink-0 items-center justify-center rounded-2xl border border-cocoa/22 bg-cream text-maroon transition duration-500 hover:border-cocoa disabled:cursor-not-allowed disabled:opacity-40 md:h-[60px] md:w-[60px]"
              >
                <Heart
                  className={`h-5 w-5 transition duration-500 ${
                    wished ? "fill-burnt-red text-burnt-red" : ""
                  }`}
                  aria-hidden="true"
                />
              </button>
            </div>
            {wishError ? (
              <p className="mt-3 text-center text-xs text-burnt-red">
                {wishError}
              </p>
            ) : null}

            {/* Reassurance row */}
            <div className="mt-8 grid grid-cols-1 gap-3 rounded-2xl border border-cocoa/12 bg-cream/60 px-5 py-4 text-[11px] uppercase tracking-[0.16em] text-charcoal/65 sm:grid-cols-2">
              <div className="flex items-center gap-2">
                <Truck className="h-4 w-4 text-cocoa" aria-hidden="true" />
                <span>Free shipping above ₹2999</span>
              </div>
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-cocoa" aria-hidden="true" />
                <span>Secure checkout</span>
              </div>
            </div>

            {/* Details (fabric / care / description) */}
            <div className="mt-10 space-y-px border-t border-cocoa/10">
              {product.description ? (
                <DetailRow label="About this piece">
                  <p className="text-sm leading-7 text-charcoal/70">
                    {product.description}
                  </p>
                </DetailRow>
              ) : null}
              {product.fabric ? (
                <DetailRow label="Fabric">
                  <p className="text-sm leading-7 text-charcoal/70">
                    {product.fabric}
                  </p>
                </DetailRow>
              ) : null}
              {product.washCare ? (
                <DetailRow label="Care">
                  <p className="text-sm leading-7 text-charcoal/70">
                    {product.washCare}
                  </p>
                </DetailRow>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <SizeGuideModal
        open={sizeGuideOpen}
        onClose={() => setSizeGuideOpen(false)}
      />
    </section>
  );
}

// ── Internal pieces ──────────────────────────────────────────────────────────

function Breadcrumb({ product }: { product: ProductWithVariants }) {
  return (
    <nav
      aria-label="Breadcrumb"
      className="flex flex-wrap items-center gap-1 text-[11px] uppercase tracking-[0.18em] text-charcoal/55"
    >
      <Link href="/" className="soft-link hover:text-cocoa">
        Home
      </Link>
      <ChevronRight className="h-3 w-3 opacity-60" aria-hidden="true" />
      <Link href="/shop" className="soft-link hover:text-cocoa">
        Shop
      </Link>
      {product.category ? (
        <>
          <ChevronRight className="h-3 w-3 opacity-60" aria-hidden="true" />
          <Link
            href={`/shop/${product.category.slug}`}
            className="soft-link hover:text-cocoa"
          >
            {product.category.name}
          </Link>
        </>
      ) : null}
      <ChevronRight className="h-3 w-3 opacity-60" aria-hidden="true" />
      <span className="text-charcoal/75">{product.title}</span>
    </nav>
  );
}

function Gallery({
  images,
  activeIdx,
  onSelect,
  altFallback,
}: {
  images: DbProductImage[];
  activeIdx: number;
  onSelect: (i: number) => void;
  altFallback: string;
}) {
  const railRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  // While a goTo()-triggered smooth scroll is in flight, handleRailScroll's
  // own scroll-position → index math would otherwise fire on the animation's
  // intermediate frames and stomp the index goTo just set (e.g. clicking
  // "next" could get silently undone by a mid-animation reading of 0).
  const programmaticScrollRef = useRef(false);
  const programmaticTimeoutRef = useRef<number | null>(null);
  const [zoomOpen, setZoomOpen] = useState(false);
  // Cursor position (as a % of the image box) driving the hover-magnify
  // effect on desktop; null means "not hovering" (magnified layer hidden).
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(
    null,
  );

  function handleMagnifyMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    setHoverPos({
      x: Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100)),
      y: Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100)),
    });
  }

  if (images.length === 0) {
    return (
      <div>
        <div className="cloth-window aspect-[4/5] w-full rounded-[22px] shadow-[0_22px_60px_rgba(43,38,35,0.08)]" />
      </div>
    );
  }

  const safeIdx = Math.min(activeIdx, images.length - 1);
  const active = images[safeIdx] ?? images[0];
  const hasMultiple = images.length > 1;

  function goTo(i: number) {
    const next = Math.max(0, Math.min(images.length - 1, i));
    onSelect(next);
    // Keep the mobile rail's scroll position in sync when navigating via
    // arrows/thumbnails rather than swiping.
    const item = railRef.current?.children[next] as HTMLElement | undefined;
    if (item) {
      programmaticScrollRef.current = true;
      if (programmaticTimeoutRef.current !== null) {
        window.clearTimeout(programmaticTimeoutRef.current);
      }
      programmaticTimeoutRef.current = window.setTimeout(() => {
        programmaticScrollRef.current = false;
      }, 500);
      item.scrollIntoView({
        behavior: "smooth",
        inline: "center",
        block: "nearest",
      });
    }
  }

  // Mobile rail: derive the active index from scroll position so arrows,
  // the counter, and swipe gestures all stay in sync with each other —
  // swiping never leaves the counter/dots pointing at the wrong image.
  function handleRailScroll() {
    if (programmaticScrollRef.current) return;
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const rail = railRef.current;
      if (!rail) return;
      const step = rail.scrollWidth / images.length;
      const i = Math.round(rail.scrollLeft / (step || 1));
      onSelect(Math.max(0, Math.min(images.length - 1, i)));
    });
  }

  return (
    <div className="md:grid md:grid-cols-[80px_1fr] md:gap-4">
      {/* Thumbnail strip — vertical on desktop, hidden on mobile (uses snap rail instead) */}
      {hasMultiple ? (
        <div className="hidden h-fit flex-col gap-3 md:flex">
          {images.map((img, i) => (
            <button
              key={img.id}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`View image ${i + 1}`}
              aria-current={i === safeIdx}
              className={`relative aspect-[3/4] overflow-hidden rounded-xl border transition duration-500 ${
                i === safeIdx
                  ? "border-maroon"
                  : "border-cocoa/14 hover:border-cocoa/40"
              }`}
            >
              <Image
                src={videoPosterUrl(img.url)}
                alt={img.altText ?? altFallback}
                fill
                sizes="80px"
                className="object-cover"
              />
            </button>
          ))}
        </div>
      ) : null}

      {/* Main image — single on desktop, swipe rail on mobile */}
      <div className="md:contents">
        {/* Mobile: horizontal scroll-snap rail showing all images.
            touch-action: pan-y tells the browser a vertical swipe that
            starts over this rail should scroll the PAGE, not get captured
            by the rail's own horizontal scroll-snap — without it, a swipe
            that isn't perfectly horizontal can hijack the gesture and the
            gallery appears to "jump" while the customer is trying to
            scroll past it. */}
        <div className="relative md:hidden">
          <div
            ref={railRef}
            onScroll={handleRailScroll}
            className="-mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [touch-action:pan-y] [&>*]:snap-always [&::-webkit-scrollbar]:hidden"
          >
            {images.map((img) => (
              <div
                key={img.id}
                className="relative aspect-[3/4] w-[88vw] shrink-0 snap-center overflow-hidden rounded-[20px] bg-cream shadow-[0_18px_55px_rgba(43,38,35,0.06)]"
              >
                {isVideoUrl(img.url) ? (
                  <video
                    src={img.url}
                    poster={videoPosterUrl(img.url)}
                    autoPlay
                    muted
                    loop
                    playsInline
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setZoomOpen(true)}
                    aria-label="Open full-screen image"
                    className="absolute inset-0"
                  >
                    <Image
                      src={img.url}
                      alt={img.altText ?? altFallback}
                      fill
                      sizes="88vw"
                      priority
                      className="object-cover"
                    />
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Overlay arrows — same pattern as desktop so users discover
              navigation without hunting below the image. Positioned inside
              the visible slide's edges (6vw peek on either side means the
              current image sits at 6vw..94vw of the viewport). */}
          {hasMultiple ? (
            <GalleryArrow
              direction="prev"
              onClick={() => goTo(safeIdx - 1)}
              disabled={safeIdx === 0}
              variant="mobileOverlay"
            />
          ) : null}
          {hasMultiple ? (
            <GalleryArrow
              direction="next"
              onClick={() => goTo(safeIdx + 1)}
              disabled={safeIdx === images.length - 1}
              variant="mobileOverlay"
            />
          ) : null}

          {hasMultiple ? (
            <GalleryCounter index={safeIdx} total={images.length} />
          ) : null}
        </div>

        {/* Desktop: single large active image (or inline video) */}
        <div className="group relative hidden aspect-[3/4] overflow-hidden rounded-[22px] bg-cream shadow-[0_22px_60px_rgba(43,38,35,0.08)] md:block">
          {isVideoUrl(active.url) ? (
            <video
              key={active.id}
              src={active.url}
              poster={videoPosterUrl(active.url)}
              autoPlay
              muted
              loop
              playsInline
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <div
              className="absolute inset-0 cursor-zoom-in"
              onMouseEnter={handleMagnifyMove}
              onMouseMove={handleMagnifyMove}
              onMouseLeave={() => setHoverPos(null)}
              onClick={() => setZoomOpen(true)}
              role="button"
              tabIndex={0}
              aria-label="Zoom image"
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") setZoomOpen(true);
              }}
            >
              <Image
                src={active.url}
                alt={active.altText ?? altFallback}
                fill
                sizes="(min-width: 1024px) 50vw, 100vw"
                priority
                className="object-cover"
              />
              {/* Cursor-following magnified layer — same image, scaled and
                  offset by hover position, so hovering the product photo
                  reveals fabric/stitching detail without a click. */}
              <Image
                src={active.url}
                alt=""
                aria-hidden="true"
                fill
                sizes="(min-width: 1024px) 50vw, 100vw"
                className="object-cover transition-opacity duration-150"
                style={{
                  opacity: hoverPos ? 1 : 0,
                  transform: "scale(2.2)",
                  transformOrigin: hoverPos
                    ? `${hoverPos.x}% ${hoverPos.y}%`
                    : "center",
                }}
              />
              <span className="pointer-events-none absolute bottom-3 right-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-charcoal/60 text-cream opacity-0 transition duration-300 group-hover:opacity-100">
                <ZoomIn className="h-4 w-4" aria-hidden="true" />
              </span>
            </div>
          )}
          {hasMultiple ? (
            <GalleryArrow
              direction="prev"
              onClick={() => goTo(safeIdx - 1)}
              disabled={safeIdx === 0}
            />
          ) : null}
          {hasMultiple ? (
            <GalleryArrow
              direction="next"
              onClick={() => goTo(safeIdx + 1)}
              disabled={safeIdx === images.length - 1}
            />
          ) : null}
          {hasMultiple ? (
            <GalleryCounter index={safeIdx} total={images.length} />
          ) : null}
        </div>

        {/* Page indicator dots — clearer than a small "3 / 5" pill and
            gives an at-a-glance sense of how many images total. Tap-to-jump
            works too. Mobile-only; desktop uses the thumbnail rail. */}
        {hasMultiple ? (
          <GalleryDots
            index={safeIdx}
            total={images.length}
            onSelect={goTo}
          />
        ) : null}
      </div>

      {zoomOpen ? (
        <ImageLightbox
          images={images}
          index={safeIdx}
          altFallback={altFallback}
          onNavigate={goTo}
          onClose={() => setZoomOpen(false)}
        />
      ) : null}
    </div>
  );
}

function ImageLightbox({
  images,
  index,
  altFallback,
  onNavigate,
  onClose,
}: {
  images: DbProductImage[];
  index: number;
  altFallback: string;
  onNavigate: (i: number) => void;
  onClose: () => void;
}) {
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(
    null,
  );
  // Touch devices have no hover — skip mounting the cursor-magnify layer
  // there entirely rather than just leaving it permanently opacity-0, so
  // there's one fewer stacked full-size image for a mobile browser to
  // composite in the fixed/portaled overlay. Lazy-initialized (not an
  // effect) since this component only ever mounts client-side, after the
  // user opens it — window is always available by then.
  const [canHover] = useState(
    () => window.matchMedia("(hover: hover) and (pointer: fine)").matches,
  );
  const active = images[index] ?? images[0];
  const hasMultiple = images.length > 1;

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") onNavigate(index - 1);
      if (e.key === "ArrowRight") onNavigate(index + 1);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [index, onNavigate, onClose]);

  if (!active || isVideoUrl(active.url)) return null;

  // Portal to document.body — the gallery sits deep inside the page tree,
  // and a fixed-position ancestor further up (any of transform/filter/
  // will-change on the way to <body>) can silently make itself the
  // containing block for position:fixed descendants, which broke z-index
  // stacking against the site header. Escaping to body sidesteps that
  // entirely regardless of what's up the tree.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Zoomed product image"
      className="fixed inset-0 z-[90] bg-charcoal"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close zoomed image"
        className="absolute inset-0"
      />
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-4 top-4 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full bg-cream/20 text-cream transition duration-300 hover:bg-cream/30 md:right-6 md:top-6"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>

      {/* Pinch-to-zoom on mobile is handled by the browser's own viewport
          zoom (maximumScale 5 set site-wide in app/layout.tsx) — this just
          needs to render the image large enough to be worth zooming into.
          Desktop gets the same cursor-magnify as the inline gallery.

          Positioned via absolute inset-* directly against the dialog
          (which always has a definite size — fixed inset-0 resolves to the
          real viewport) rather than flexbox. A flex child whose only
          children are next/image `fill` (position:absolute) elements has
          nothing to establish its own auto height from, so with flex-1 in
          a flex-col + justify-center parent it silently collapsed to zero
          height — the image, being absolutely positioned inside a
          zero-height box, never painted, while sibling absolute elements
          (close button, arrows, counter) rendered fine since they're
          positioned against the dialog itself, not this box. That's what
          was actually behind the "black screen, no image" report — vh
          units and backdrop-filter reliability were real fixes too, but
          this was the one actually hiding the image. */}
      <div
        className="absolute inset-6 z-0 cursor-zoom-in md:inset-10 lg:inset-x-24"
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setHoverPos({
            x: Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100)),
            y: Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100)),
          });
        }}
        onMouseLeave={() => setHoverPos(null)}
      >
        <Image
          src={active.url}
          alt={active.altText ?? altFallback}
          fill
          sizes="100vw"
          quality={90}
          className="object-contain"
        />
        {canHover ? (
          <Image
            src={active.url}
            alt=""
            aria-hidden="true"
            fill
            sizes="100vw"
            quality={90}
            className="object-contain transition-opacity duration-150"
            style={{
              opacity: hoverPos ? 1 : 0,
              transform: "scale(2.4)",
              transformOrigin: hoverPos
                ? `${hoverPos.x}% ${hoverPos.y}%`
                : "center",
            }}
          />
        ) : null}
      </div>

      {hasMultiple ? (
        <>
          <GalleryArrow
            direction="prev"
            onClick={() => onNavigate(index - 1)}
            disabled={index === 0}
            variant="overlay"
          />
          <GalleryArrow
            direction="next"
            onClick={() => onNavigate(index + 1)}
            disabled={index === images.length - 1}
            variant="overlay"
          />
          <div className="absolute bottom-6 left-1/2 z-10 -translate-x-1/2 rounded-full bg-cream/20 px-4 py-1.5 text-xs uppercase tracking-[0.16em] text-cream">
            {index + 1} / {images.length}
          </div>
        </>
      ) : null}
    </div>,
    document.body,
  );
}

function GalleryArrow({
  direction,
  onClick,
  disabled,
  variant = "overlay",
}: {
  direction: "prev" | "next";
  onClick: () => void;
  disabled: boolean;
  variant?: "overlay" | "mobileOverlay" | "inline";
}) {
  const Icon = direction === "prev" ? ChevronLeft : ChevronRight;
  // Desktop overlay: sits inside the image with a small inset (left-3/right-3).
  // Mobile overlay: needs to align with the visible slide's edge, which sits
  // at ~6vw from each side of the viewport (88vw slide, centered). Extra
  // touch area (h-11/w-11 = 44px minimum) satisfies iOS HIG.
  const overlayPosition =
    direction === "prev" ? "left-3" : "right-3";
  const mobilePosition =
    direction === "prev" ? "left-[calc(6vw+8px)]" : "right-[calc(6vw+8px)]";
  const overlayBase =
    "absolute top-1/2 z-10 -translate-y-1/2 grid place-items-center rounded-full border border-cream/50 bg-cream/80 text-maroon shadow-[0_12px_34px_rgba(43,38,35,0.14)] backdrop-blur-xl transition duration-500 disabled:pointer-events-none disabled:opacity-0";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={direction === "prev" ? "Previous image" : "Next image"}
      className={
        variant === "overlay"
          ? `${overlayBase} ${overlayPosition} h-10 w-10 hover:bg-cream/95`
          : variant === "mobileOverlay"
            ? `${overlayBase} ${mobilePosition} h-11 w-11 active:scale-95 active:bg-cream`
            : "grid h-9 w-9 place-items-center rounded-full border border-cocoa/22 bg-cream text-maroon shadow-[0_6px_18px_rgba(43,38,35,0.06)] transition duration-500 hover:border-cocoa disabled:opacity-30"
      }
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}

function GalleryCounter({ index, total }: { index: number; total: number }) {
  return (
    <span className="pointer-events-none absolute bottom-4 right-4 rounded-full border border-cream/50 bg-charcoal/45 px-2.5 py-1 text-[11px] font-medium tabular-nums text-cream backdrop-blur-md">
      {index + 1} / {total}
    </span>
  );
}

function GalleryDots({
  index,
  total,
  onSelect,
}: {
  index: number;
  total: number;
  onSelect: (i: number) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Product images"
      className="mt-4 flex items-center justify-center gap-2 md:hidden"
    >
      {Array.from({ length: total }).map((_, i) => {
        const active = i === index;
        return (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={`Go to image ${i + 1}`}
            onClick={() => onSelect(i)}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              active
                ? "w-6 bg-maroon"
                : "w-1.5 bg-cocoa/25 hover:bg-cocoa/45"
            }`}
          />
        );
      })}
    </div>
  );
}

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <details className="group border-b border-cocoa/10 py-5 [&[open]>summary>span:last-child]:rotate-45">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[11px] font-medium uppercase tracking-[0.18em] text-charcoal/65">
        <span>{label}</span>
        <span
          aria-hidden="true"
          className="inline-flex h-6 w-6 items-center justify-center text-cocoa transition-transform duration-500"
        >
          <Plus className="h-3.5 w-3.5" />
        </span>
      </summary>
      <div className="pt-4">{children}</div>
    </details>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function isString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}
function uniqueOrdered(arr: string[]): string[] {
  return Array.from(new Set(arr));
}

/**
 * Best-effort swatch colour from a colour name. Real brands keep a
 * name→hex lookup; we map common neutrals and let CSS handle unknowns
 * (browsers parse most CSS colour names natively).
 */
function colorToCss(name: string): string {
  const key = name.trim().toLowerCase();
  const map: Record<string, string> = {
    sand: "#d9c7ad",
    clay: "#b89274",
    ivory: "#f1eadb",
    cream: "#f6f1ea",
    cocoa: "#8c6a5a",
    charcoal: "#2b2623",
    maroon: "#4a1f1f",
    burgundy: "#5e2128",
    black: "#1a1a1a",
    white: "#fafafa",
    ecru: "#e3d8c2",
    sage: "#a8b59b",
    olive: "#737d52",
    rose: "#dcb6b1",
    blush: "#e8c8c4",
    rust: "#b75331",
    terracotta: "#c87654",
    indigo: "#2a3568",
    navy: "#202945",
  };
  return map[key] ?? name;
}
