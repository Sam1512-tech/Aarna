import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ProductCard, toProductCardData } from "@/components/storefront/product-card";
import { ProductDetailView } from "@/components/storefront/product-detail-view";
import { ProductReviews } from "@/components/storefront/product-reviews";
import { getProductBySlug, getRelatedProducts } from "@/lib/actions/products";
import { getApprovedReviews } from "@/lib/actions/reviews";
import { productMetadata } from "@/lib/seo/metadata";
import { buildBreadcrumbLd, buildProductLd, safeJsonLd } from "@/lib/seo/schemas";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  try {
    const product = await getProductBySlug(slug);
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
  const product = await getProductBySlug(slug);
  if (!product) notFound();

  const [related, reviewSummary] = await Promise.all([
    getRelatedProducts(product.id, 4),
    getApprovedReviews(product.id).catch(() => ({
      average: 0,
      count: 0,
      reviews: [],
    })),
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
