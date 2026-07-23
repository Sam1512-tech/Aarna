/**
 * JSON-LD structured data builders for SEO. Drop the resulting object into a
 * <script type="application/ld+json"> tag and Google Search will use it for
 * product cards, breadcrumbs, and rich results.
 *
 * Usage in a server component:
 *
 *   const ld = buildProductLd(productWithVariants);
 *   return (
 *     <>
 *       <script
 *         type="application/ld+json"
 *         dangerouslySetInnerHTML={{ __html: safeJsonLd(ld) }}
 *       />
 *       <ProductPage ... />
 *     </>
 *   );
 */

import type { ProductWithVariants } from "@/lib/types";

/**
 * Serializes a JSON-LD object for safe embedding in a <script> tag. Plain
 * JSON.stringify doesn't escape "<", so admin-entered free text that ends up
 * in the payload (a product title/description) containing something like
 * "</script><script>..." would prematurely close the tag and inject real,
 * executable markup into the page for every visitor. Also escapes ">" and
 * "&" as defense in depth (matters if this ever lands inside an HTML
 * comment or is read back by a non-JSON-aware parser) and U+2028/U+2029,
 * which are valid in a JSON string but illegal in JS source and can break
 * some non-<script>-tag consumers.
 */
export function safeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://shopaarna.in";

const BRAND_LD = {
  "@type": "Brand",
  name: "Aarna",
  url: APP_URL,
};

const SELLER_LD = {
  "@type": "Organization",
  name: "Aarna Label",
  url: APP_URL,
  email: "hello@shopaarna.in",
  telephone: "+91-79-75639485",
  address: {
    "@type": "PostalAddress",
    streetAddress: "No. 3571, 1st H Cross, Behind Girinagar Police Station",
    addressLocality: "Bengaluru",
    addressRegion: "Karnataka",
    postalCode: "560085",
    addressCountry: "IN",
  },
  taxID: "29ACNFA3302J1ZD",
};

// ── Product ──────────────────────────────────────────────────────────────────

export function buildProductLd(
  product: ProductWithVariants,
  reviewSummary?: { average: number; count: number },
) {
  const url = `${APP_URL}/product/${product.slug}`;
  const images = product.images
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((i) => i.url);

  const inStockVariants = product.variants.filter((v) => v.isActive && v.stock > 0);
  const availability =
    inStockVariants.length > 0
      ? "https://schema.org/InStock"
      : "https://schema.org/OutOfStock";

  // Compute price range across variants (or basePrice if no variants)
  const prices = product.variants
    .filter((v) => v.isActive)
    .map((v) => v.price);
  const lowPrice = prices.length > 0 ? Math.min(...prices) : product.basePrice;
  const highPrice = prices.length > 0 ? Math.max(...prices) : product.basePrice;

  // Multi-variant → AggregateOffer; single price → simple Offer
  const offers =
    prices.length > 1 && lowPrice !== highPrice
      ? {
          "@type": "AggregateOffer",
          priceCurrency: "INR",
          lowPrice: (lowPrice / 100).toFixed(2),
          highPrice: (highPrice / 100).toFixed(2),
          offerCount: prices.length,
          availability,
          seller: SELLER_LD,
        }
      : {
          "@type": "Offer",
          priceCurrency: "INR",
          price: (lowPrice / 100).toFixed(2),
          availability,
          url,
          seller: SELLER_LD,
        };

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    description: product.description ?? undefined,
    image: images.length > 0 ? images : undefined,
    sku: product.variants[0]?.sku ?? undefined,
    brand: BRAND_LD,
    material: product.fabric ?? undefined,
    category: product.category?.name ?? undefined,
    url,
    offers,
    aggregateRating:
      reviewSummary && reviewSummary.count > 0
        ? {
            "@type": "AggregateRating",
            ratingValue: reviewSummary.average.toFixed(1),
            reviewCount: reviewSummary.count,
          }
        : undefined,
  };
}

// ── Breadcrumb ───────────────────────────────────────────────────────────────

export interface BreadcrumbItem {
  name: string;
  url: string;
}

export function buildBreadcrumbLd(items: BreadcrumbItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: item.url.startsWith("http") ? item.url : `${APP_URL}${item.url}`,
    })),
  };
}

// ── Organization (for home page) ─────────────────────────────────────────────

export function buildOrganizationLd() {
  return {
    "@context": "https://schema.org",
    ...SELLER_LD,
    "@type": "OnlineStore",
    legalName: "Aarna Label",
    brand: BRAND_LD,
    paymentAccepted: ["Credit Card", "Debit Card", "UPI", "Net Banking"],
    currenciesAccepted: "INR",
    areaServed: {
      "@type": "Country",
      name: "India",
    },
  };
}

// ── Web Site (search box) ────────────────────────────────────────────────────

export function buildWebSiteLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Aarna",
    url: APP_URL,
    potentialAction: {
      "@type": "SearchAction",
      target: `${APP_URL}/search?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}
