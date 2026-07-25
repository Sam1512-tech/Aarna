"use client";

import Image from "next/image";
import { isVideoUrl, videoPosterUrl } from "@/lib/media";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronRight,
  Heart,
  Lock,
  Minus,
  Plus,
  Star,
  Truck,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { addToCart, getCart } from "@/lib/actions/cart";
import { addToWishlist } from "@/lib/actions/account";
import { getVariantsInStockForProduct } from "@/lib/actions/products";
import { actionErrorMessage } from "@/lib/action-error";
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
  // Starts from the server-rendered prop (fresh at page load) but is
  // refreshed client-side below — a customer can sit on this exact page
  // long enough for someone else's checkout hold to take the last unit, or
  // for an abandoned one to release stock back.
  const [variants, setVariants] = useState(product.variants);
  const activeVariants = useMemo(
    () => variants.filter((v) => v.isActive),
    [variants],
  );

  // Re-check real stock when the customer comes back to this tab — the
  // realistic moment this matters, without building websocket/polling infra
  // for a customer who never looks away (known, accepted limitation).
  useEffect(() => {
    function refreshOnReturn() {
      if (document.visibilityState !== "visible") return;
      getVariantsInStockForProduct(product.id).then((fresh) => {
        setVariants((prev) =>
          prev.map((v) => {
            const match = fresh.find((f) => f.variantId === v.id);
            // Not in the fresh active-only list means it was deactivated
            // since this page loaded — same "nothing to sell" outcome as
            // zero stock.
            return match
              ? { ...v, stock: match.stock, isActive: true }
              : { ...v, isActive: false, stock: 0 };
          }),
        );
      });
    }
    document.addEventListener("visibilitychange", refreshOnReturn);
    return () =>
      document.removeEventListener("visibilitychange", refreshOnReturn);
  }, [product.id]);
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
  // Healthy stock is silent by design (Amazon/Myntra convention) — a stock
  // note only ever appears here to say something the customer needs to
  // know (it's gone, or there's not much left), never to reassure them
  // when there's nothing to say.
  const stockNote = !resolvedVariant
    ? null
    : !inStock
      ? "sold out — try another size or colour"
      : resolvedVariant.stock <= LOW_STOCK_THRESHOLD
        ? `only ${resolvedVariant.stock} left`
        : null;

  const onSale =
    typeof product.mrp === "number" && product.mrp > product.basePrice;
  const displayPrice = resolvedVariant?.price ?? product.basePrice;

  // ── Add to bag / wishlist ──────────────────────────────────────────────────
  const [isPending, startTransition] = useTransition();
  const [bagFeedback, setBagFeedback] = useState<null | "added" | "error">(null);
  // The actual reason, when it's an error — "just sold out" and "only 1
  // more available" are different, true things, not the same generic
  // failure. The button label itself just says "try again" either way.
  const [bagError, setBagError] = useState<string | null>(null);
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
    setBagError(null);
    startTransition(async () => {
      try {
        const next = await addToCart(resolvedVariant.id, quantity);
        useCartCount.getState().set(next.itemCount);
        const line = next.lines.find((l) => l.variantId === resolvedVariant.id);
        setCartQty(line?.quantity ?? quantity);
        setBagFeedback("added");
        window.setTimeout(() => setBagFeedback(null), 2200);
      } catch (err) {
        // A race with someone else's checkout hold surfaces exactly here —
        // addToCart's own stock check throws a specific, honest reason
        // ("X just sold out" / "only N more available"), not just a generic
        // failure. Show it, don't swallow it.
        setBagError(
          actionErrorMessage(err, "Couldn't add to bag — please try again"),
        );
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
          <div className="md:sticky md:top-[116px] md:self-start">
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
            {bagError ? (
              <p className="mt-3 text-center text-xs text-burnt-red">
                {bagError}
              </p>
            ) : null}
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
  const thumbStripRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  // Cursor position (as a % of the image box) driving the hover-magnify
  // effect on desktop; null means "not hovering" (magnified layer hidden).
  // This is the only zoom affordance now — no click-to-fullscreen, on either
  // device, and no zoom at all on mobile (there's no hover there).
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

  // Desktop only — clicking a thumbnail selects it directly.
  function selectThumb(i: number) {
    const next = Math.max(0, Math.min(images.length - 1, i));
    onSelect(next);
    const item = thumbStripRef.current?.children[next] as HTMLElement | undefined;
    item?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }

  // Mobile only — derive the active index from the swipe rail's scroll
  // position, so the counter tracks whichever image the customer swiped to.
  // No arrows/thumbnails ever drive this rail programmatically, so there's
  // no "was this scroll caused by us" guard to worry about here.
  function handleRailScroll() {
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
    <div className="min-w-0 md:grid md:grid-cols-[80px_1fr] md:gap-4 md:self-start">
      {/* Desktop only: vertical thumbnail column — click to select. */}
      {hasMultiple ? (
        <div ref={thumbStripRef} className="hidden h-fit flex-col gap-3 md:flex">
          {images.map((img, i) => (
            <button
              key={img.id}
              type="button"
              onClick={() => selectThumb(i)}
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

      <div className="md:contents">
        {/* Mobile only: swipeable rail — no thumbnails, no arrows, no zoom.
            Deliberately no touch-action override (default auto) so the
            browser's native per-axis gesture detection lets this actually
            swipe — an explicit pan-y here previously disabled horizontal
            touch-scroll entirely. */}
        <div className="relative md:hidden">
          <div
            ref={railRef}
            onScroll={handleRailScroll}
            className="-mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&>*]:snap-always [&::-webkit-scrollbar]:hidden"
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
                  <Image
                    src={img.url}
                    alt={img.altText ?? altFallback}
                    fill
                    sizes="88vw"
                    priority
                    className="object-cover"
                  />
                )}
              </div>
            ))}
          </div>
          {hasMultiple ? (
            <GalleryCounter index={safeIdx} total={images.length} />
          ) : null}
        </div>

        {/* Desktop only: single hero image (or inline video) with a
            cursor-following hover-magnify layer — no click, no full-screen. */}
        <div className="relative hidden aspect-[3/4] overflow-hidden rounded-[22px] bg-cream shadow-[0_22px_60px_rgba(43,38,35,0.08)] md:block">
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
              className="absolute inset-0"
              onMouseEnter={handleMagnifyMove}
              onMouseMove={handleMagnifyMove}
              onMouseLeave={() => setHoverPos(null)}
            >
              <Image
                src={active.url}
                alt={active.altText ?? altFallback}
                fill
                sizes="(min-width: 1280px) 550px, (min-width: 1024px) 46vw, 100vw"
                priority
                className="object-cover"
              />
              {/* Cursor-following magnified layer — same image, scaled and
                  offset by hover position, so hovering the product photo
                  reveals fabric/stitching detail with no click needed and
                  no full-screen view ever opening. */}
              <Image
                src={active.url}
                alt=""
                aria-hidden="true"
                fill
                sizes="(min-width: 1280px) 550px, (min-width: 1024px) 46vw, 100vw"
                className="object-cover transition-opacity duration-150"
                style={{
                  opacity: hoverPos ? 1 : 0,
                  transform: "scale(2.2)",
                  transformOrigin: hoverPos
                    ? `${hoverPos.x}% ${hoverPos.y}%`
                    : "center",
                }}
              />
            </div>
          )}
          {hasMultiple ? (
            <GalleryCounter index={safeIdx} total={images.length} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function GalleryCounter({ index, total }: { index: number; total: number }) {
  return (
    <span className="pointer-events-none absolute bottom-4 right-4 rounded-full border border-cream/50 bg-charcoal/45 px-2.5 py-1 text-[11px] font-medium tabular-nums text-cream backdrop-blur-md">
      {index + 1} / {total}
    </span>
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
