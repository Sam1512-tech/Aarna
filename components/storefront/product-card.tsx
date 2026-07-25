import Image from "next/image";
import Link from "next/link";
import { videoPosterUrl } from "@/lib/media";
import type { Product, ProductImage } from "@/lib/types";
import { formatINR } from "@/lib/utils";
import { WishlistHeartButton } from "@/components/storefront/wishlist-heart-button";

// What the card needs. Accept a plain shape so callers can pass either a full
// Product row or a slimmed-down query result without ceremony.
export interface ProductCardData {
  id: string;
  slug: string;
  title: string;
  basePrice: number;
  mrp?: number | null;
  fabric?: string | null;
  image?: { url: string; altText: string | null } | null;
  /** The variant a wishlist toggle acts on. Only present where the caller
   *  actually wired up wishlisting (currently PLP grids) — omit it (or the
   *  wish props below) and no heart renders at all, same card either way. */
  defaultVariantId?: string | null;
}

interface ProductCardProps {
  product: ProductCardData;
  /** Whether defaultVariantId is currently in the customer's wishlist.
   *  Omit along with onToggleWish to render the card with no heart, e.g. on
   *  the homepage rail or PDP's related products, which don't wire this up. */
  wished?: boolean;
  onToggleWish?: () => void;
}

/**
 * Premium product card. Reused on the homepage rail, search results, PLP
 * grids, related-products on the PDP, and the wishlist.
 *
 * Image-first composition with a cloth-window placeholder when no image is
 * available, a subtle on-hover zoom, an optional discount chip when mrp >
 * basePrice, and a single-line meta row (title + price, fabric below).
 *
 * Title and meta come from real product data. All prices go through formatINR
 * (input is paise — Aarna's source-of-truth convention).
 */
export function ProductCard({ product, wished, onToggleWish }: ProductCardProps) {
  const onSale =
    typeof product.mrp === "number" && product.mrp > product.basePrice;
  const discountPct = onSale
    ? Math.round(((product.mrp! - product.basePrice) / product.mrp!) * 100)
    : 0;
  const showWishlist = !!product.defaultVariantId && !!onToggleWish;

  return (
    <Link
      href={`/product/${product.slug}`}
      className="group block"
      aria-label={product.title}
    >
      <div className="relative aspect-[3/4] overflow-hidden rounded-[18px] bg-cream shadow-[0_14px_40px_rgba(43,38,35,0.06)]">
        {product.image?.url ? (
          <Image
            src={product.image.url}
            alt={product.image.altText ?? product.title}
            fill
            sizes="(min-width: 1280px) 320px, (min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="cloth-window h-full w-full transition-transform duration-500 group-hover:scale-[1.04]" />
        )}

        {onSale ? (
          <span className="absolute left-3 top-3 rounded-full border border-cream/60 bg-cream/95 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-burnt-red shadow-[0_8px_20px_rgba(43,38,35,0.06)] backdrop-blur-md">
            {discountPct}% off
          </span>
        ) : null}

        {showWishlist ? (
          <WishlistHeartButton wished={!!wished} onToggle={onToggleWish!} />
        ) : null}
      </div>

      <div className="mt-4 space-y-1">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="font-sans text-sm font-normal leading-snug text-charcoal">
            {product.title}
          </h3>
          <div className="flex shrink-0 items-baseline gap-1.5 text-sm text-charcoal">
            <span>{formatINR(product.basePrice)}</span>
            {onSale ? (
              <span className="text-xs text-charcoal/45 line-through">
                {formatINR(product.mrp!)}
              </span>
            ) : null}
          </div>
        </div>
        {product.fabric ? (
          <p className="text-xs text-charcoal/55">{product.fabric}</p>
        ) : null}
      </div>
    </Link>
  );
}

// ── Helper: derive ProductCardData from full DB shapes ───────────────────────

/**
 * Given a Product row + an optional list of its images, return the slim shape
 * the card consumes. Use this in server pages when you've fetched products
 * separately from images.
 */
export function toProductCardData(
  product: Product & { image?: { url: string; altText: string | null } | null },
  images?: ProductImage[],
  defaultVariantId?: string | null,
): ProductCardData {
  const first = images?.length
    ? [...images].sort((a, b) => a.sortOrder - b.sortOrder)[0]
    : product.image ?? null;
  return {
    id: product.id,
    slug: product.slug,
    title: product.title,
    basePrice: product.basePrice,
    mrp: product.mrp,
    fabric: product.fabric,
    // videoPosterUrl is a no-op for image URLs; for a video it swaps in the
    // Cloudinary poster frame so the card always renders a still.
    image: first
      ? { url: videoPosterUrl(first.url), altText: first.altText }
      : null,
    defaultVariantId: defaultVariantId ?? null,
  };
}
