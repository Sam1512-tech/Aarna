/**
 * Next.js Metadata builders for SEO. Pass the resulting object as the export
 * from generateMetadata() in a page.tsx and Next.js sets all the right tags:
 * <title>, <meta description>, OG, Twitter, canonical URL.
 */

import type { Metadata } from "next";
import type { ProductWithVariants, Category, Collection } from "@/lib/types";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://shopaarna.in";
const SITE_NAME = "Aarna";
const DEFAULT_OG_IMAGE = `${APP_URL}/logo.png`;

function absolute(path: string): string {
  return path.startsWith("http") ? path : `${APP_URL}${path}`;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1).trimEnd() + "…";
}

// ── Product page ─────────────────────────────────────────────────────────────

export function productMetadata(product: ProductWithVariants): Metadata {
  const url = `${APP_URL}/product/${product.slug}`;
  const image =
    product.images.sort((a, b) => a.sortOrder - b.sortOrder)[0]?.url ??
    DEFAULT_OG_IMAGE;

  const description =
    product.description ??
    [product.fabric, product.category?.name]
      .filter(Boolean)
      .join(" · ") ??
    "Shop the latest from Aarna by Arpitha Abhishek.";

  return {
    title: `${product.title} — ${SITE_NAME}`,
    description: truncate(description, 160),
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      url,
      title: product.title,
      description: truncate(description, 200),
      siteName: SITE_NAME,
      images: [{ url: absolute(image), alt: product.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: product.title,
      description: truncate(description, 200),
      images: [absolute(image)],
    },
  };
}

// ── Category (PLP) page ──────────────────────────────────────────────────────

export function categoryMetadata(category: Category): Metadata {
  const url = `${APP_URL}/shop/${category.slug}`;
  const description = `Shop ${category.name} from Aarna — indo-western fashion designed in India.`;

  return {
    title: `${category.name} — ${SITE_NAME}`,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      url,
      title: `${category.name} — ${SITE_NAME}`,
      description,
      siteName: SITE_NAME,
      images: [{ url: DEFAULT_OG_IMAGE, alt: SITE_NAME }],
    },
  };
}

// ── Collection page ──────────────────────────────────────────────────────────

export function collectionMetadata(collection: Collection): Metadata {
  const url = `${APP_URL}/collections/${collection.slug}`;
  const description =
    collection.description ??
    `Explore the ${collection.name} collection from Aarna.`;
  const image = collection.heroImageUrl ?? DEFAULT_OG_IMAGE;

  return {
    title: `${collection.name} — ${SITE_NAME}`,
    description: truncate(description, 160),
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      url,
      title: `${collection.name} — ${SITE_NAME}`,
      description: truncate(description, 200),
      siteName: SITE_NAME,
      images: [{ url: absolute(image), alt: collection.name }],
    },
  };
}

// ── Default site metadata (for root layout) ─────────────────────────────────

export const defaultMetadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: `${SITE_NAME} by Arpitha Abhishek`,
    template: `%s · ${SITE_NAME}`,
  },
  description:
    "Aarna by Arpitha Abhishek — indo-western fashion crafted in India.",
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "en_IN",
    images: [{ url: DEFAULT_OG_IMAGE, alt: SITE_NAME }],
  },
  twitter: {
    card: "summary_large_image",
    images: [DEFAULT_OG_IMAGE],
  },
};
