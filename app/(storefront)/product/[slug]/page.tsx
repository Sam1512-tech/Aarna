import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ProductCard, toProductCardData } from "@/components/storefront/product-card";
import { ProductDetailView } from "@/components/storefront/product-detail-view";
import { ProductReviews } from "@/components/storefront/product-reviews";
import { getProductBySlug, getRelatedProducts } from "@/lib/actions/products";
import { getApprovedReviews } from "@/lib/actions/reviews";
import { safeDbRead, SAFE_DB_READ_TIMEOUT_MS } from "@/lib/db/safe-query";
import { productMetadata } from "@/lib/seo/metadata";
import { buildBreadcrumbLd, buildProductLd, safeJsonLd } from "@/lib/seo/schemas";
import type { ProductWithVariants } from "@/lib/types";

// Distinguishes "the product genuinely doesn't exist" (null — a real 404)
// from "the DB read timed out" (this sentinel — must NOT become a 404, or a
// transient Supabase pooler hang would tell crawlers a real, live product
// page permanently doesn't exist).
const TIMED_OUT = Symbol("product-lookup-timed-out");

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  try {
    const product = await safeDbRead<ProductWithVariants | null | typeof TIMED_OUT>(
      getProductBySlug(slug),
      {
        timeoutMs: SAFE_DB_READ_TIMEOUT_MS,
        fallback: TIMED_OUT,
        label: `PDP metadata lookup (${slug})`,
      },
    );
    // Deliberately distinct from the "genuinely doesn't exist" case below —
    // live-observed: a timeout here doesn't mean the product is gone, the
    // page component's own (separate, unmemoized) lookup right after this
    // one can still succeed and render the real product a moment later. A
    // "Product not found" title on a page that actually renders fine would
    // be a real, confusing regression, not just an unlikely edge case.
    if (product === TIMED_OUT) return { title: "Product" };
    if (!product) return { title: "Product not found" };
    return productMetadata(product);
  } catch {
    return { title: "Product" };
  }
}

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = await safeDbRead<ProductWithVariants | null | typeof TIMED_OUT>(
    getProductBySlug(slug),
    {
      timeoutMs: SAFE_DB_READ_TIMEOUT_MS,
      fallback: TIMED_OUT,
      label: `PDP product lookup (${slug})`,
    },
  );
  if (product === TIMED_OUT) {
    // A real, bounded error (renders the app's error boundary, HTTP 500) —
    // not notFound(), which would falsely tell a crawler this page is gone.
    throw new Error(`Product lookup timed out for slug "${slug}"`);
  }
  if (!product) notFound();

  const [related, reviewSummary] = await Promise.all([
    safeDbRead(getRelatedProducts(product.id, 4), {
      timeoutMs: SAFE_DB_READ_TIMEOUT_MS,
      fallback: [],
      label: `PDP related products (${slug})`,
    }),
    safeDbRead(getApprovedReviews(product.id), {
      timeoutMs: SAFE_DB_READ_TIMEOUT_MS,
      fallback: { average: 0, count: 0, reviews: [] },
      label: `PDP reviews (${slug})`,
    }),
  ]);
  const productLd = buildProductLd(product, reviewSummary);
  const breadcrumbLd = buildBreadcrumbLd([
    { name: "Home", url: "/" },
    { name: "Shop", url: "/shop" },
    ...(product.category
      ? [
          {
            name: product.category.name,
            url: `/shop/${product.category.slug}`,
          },
        ]
      : []),
    { name: product.title, url: `/product/${product.slug}` },
  ]);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(productLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbLd) }}
      />

      <ProductDetailView
        product={product}
        reviewSummary={{
          average: reviewSummary.average,
          count: reviewSummary.count,
        }}
      />

      <ProductReviews
        average={reviewSummary.average}
        count={reviewSummary.count}
        reviews={reviewSummary.reviews}
      />

      {related.length > 0 ? (
        <section className="bg-cream px-5 pb-24 md:px-6 md:pb-32">
          <div className="mx-auto max-w-7xl">
            <div className="flex items-end justify-between gap-5 border-t border-cocoa/12 pb-10 pt-14 md:pt-20">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.24em] text-cocoa">
                  You may also love
                </p>
                <h2 className="mt-3 font-display text-3xl leading-tight text-maroon md:text-5xl">
                  Pieces in the same chapter.
                </h2>
              </div>
              <Link
                href="/shop"
                className="soft-link hidden text-[11px] font-bold uppercase tracking-[0.24em] text-maroon sm:inline-flex"
              >
                View all
              </Link>
            </div>
            <div className="grid gap-x-5 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
              {related.map((p) => (
                <ProductCard key={p.id} product={toProductCardData(p)} />
              ))}
            </div>
          </div>
        </section>
      ) : null}
    </>
  );
}
