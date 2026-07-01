import Image from "next/image";
import Link from "next/link";
import type { Product, ProductImage } from "@/lib/types";
import { formatINR } from "@/lib/utils";

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
}

interface ProductCardProps {
  product: ProductCardData;
  /** Reveal-stagger index for entrance animation (0-2 cycles). Optional. */
  staggerIndex?: number;
}

/**
 * Premium product card. Reused on the homepage rail, search results, PLP
 * grids, related-products on the PDP, and (later) the wishlist.
 *
 * Image-first composition with a cloth-window placeholder when no image is
 * available, a subtle on-hover zoom, an optional discount chip when mrp >
 * basePrice, and a single-line meta row (title + price, fabric below).
 *
 * Title and meta come from real product data. All prices go through formatINR
 * (input is paise — Aarna's source-of-truth convention).
 */
export function ProductCard({ product, staggerIndex = 0 }: ProductCardProps) {
  const onSale =
    typeof product.mrp === "number" && product.mrp > product.basePrice;
  const discountPct = onSale
    ? Math.round(((product.mrp! - product.basePrice) / product.mrp!) * 100)
    : 0;

  return (
    <Link
      href={`/product/${product.slug}`}
      className={`reveal-up reveal-stagger-${(staggerIndex % 3) + 1} group block`}
      aria-label={product.title}
    >
      <div className="relative aspect-[3/4] overflow-hidden rounded-[18px] bg-cream shadow-[0_14px_40px_rgba(43,38,35,0.06)]">
        {product.image?.url ? (
          <Image
            src={product.image.url}
            alt={product.image.altText ?? product.title}
            fill
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
            className="object-cover transition-transform duration-1000 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="cloth-window h-full w-full transition-transform duration-1000 group-hover:scale-[1.04]" />
        )}

        {onSale ? (
          <span className="absolute left-3 top-3 rounded-full border border-cream/60 bg-cream/95 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-burnt-red shadow-[0_8px_20px_rgba(43,38,35,0.06)] backdrop-blur-md">
            {discountPct}% off
          </span>
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
          <p className="text-xs lowercase text-charcoal/55">{product.fabric}</p>
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
  product: Product,
  images?: ProductImage[],
): ProductCardData {
  const first = images?.length
    ? [...images].sort((a, b) => a.sortOrder - b.sortOrder)[0]
    : null;
  return {
    id: product.id,
    slug: product.slug,
    title: product.title,
    basePrice: product.basePrice,
    mrp: product.mrp,
    fabric: product.fabric,
    image: first ? { url: first.url, altText: first.altText } : null,
  };
}
