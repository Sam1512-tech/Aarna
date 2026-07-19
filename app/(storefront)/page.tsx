import Image from "next/image";
import Link from "next/link";
import { Feather, Infinity, ShieldCheck, Sparkles } from "lucide-react";
import { HomepageCarousel } from "@/components/storefront/homepage-carousel";
import { TwoVideoSection } from "@/components/storefront/two-video-section";
import { ScrollRail } from "@/components/storefront/scroll-rail";
import { getActiveBanners, getActiveHomepageVideoSlots } from "@/lib/actions/banners";
import {
  getCategories,
  getHomepageFeaturedCollection,
  getNewArrivals,
} from "@/lib/actions/products";
import { isVideoUrl, videoPosterUrl } from "@/lib/media";
import type { Product } from "@/lib/types";
import { formatINR } from "@/lib/utils";

// Fisher-Yates shuffle → take `count`. Runs in the server component on every
// request, so the featured pick changes for every visitor without any client
// hydration cost.
function pickRandom<T>(pool: T[], count: number): T[] {
  if (pool.length <= count) return pool;
  const copy = [...pool];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, count);
}

function productColor(product: Product) {
  if (
    product.metadata &&
    typeof product.metadata === "object" &&
    !Array.isArray(product.metadata)
  ) {
    const metadata = product.metadata as Record<string, unknown>;

    if (typeof metadata.color === "string") {
      return metadata.color;
    }
  }

  return null;
}

// Clean single-weight Lucide icons — no more hand-drawn doodles.
const rituals = [
  { label: "Everyday comfort", Icon: Feather },
  { label: "Timeless design", Icon: Infinity },
  { label: "Premium fabrics", Icon: Sparkles },
  { label: "Made to last", Icon: ShieldCheck },
];

export default async function HomePage() {
  // Featured collection: if the client has picked one in admin
  // (isHomepageFeature), show its real products under its own name. Otherwise
  // fall back to shuffling 4 in-stock items out of the last 20 arrivals so
  // the section never sits static without any admin work.
  const [categories, featured, arrivalPool, banners, videoSlots] = await Promise.all([
    getCategories(),
    getHomepageFeaturedCollection(4),
    getNewArrivals({ limit: 20, inStockOnly: true }),
    getActiveBanners(),
    getActiveHomepageVideoSlots(),
  ]);
  const products = featured?.products.length
    ? featured.products
    : pickRandom(arrivalPool, 4);
  const featuredEyebrow = featured ? featured.collection.name : "Featured collection";
  const featuredHeading = featured
    ? (featured.collection.description ?? "A closer look at this chapter.")
    : "Slow essentials, taking shape for the first chapter.";

  const carouselBanners = banners.map((b) => ({
    id: b.id,
    imageUrl: b.imageUrl,
    mobileImageUrl: b.mobileImageUrl,
    title: b.title,
    subtitle: b.subtitle,
    ctaLabel: b.ctaLabel,
    ctaHref: b.ctaHref,
  }));
  // Photos drive the hero banner under the nav. The "made to live in"
  // section is its own fixed two-video layout (lib/actions/admin/homepage-video-slots.ts),
  // not part of the banners rotation.
  const photoBanners = carouselBanners.filter((b) => !isVideoUrl(b.imageUrl));

  return (
    <>
      <div className="md:hidden">
        <section className="paper-grain bg-cream pt-[128px]">
          <HomepageCarousel
            banners={photoBanners}
            variant="inline"
            flush
            inlineClassName="aspect-[4/5]"
          />
          <div className="px-5 pb-14 pt-12 text-center">
            <h1 className="font-display text-[52px] leading-[0.98] text-maroon">
              Clothing made to live softly
            </h1>
            <Link
              href="/shop"
              className="mt-8 inline-flex rounded-2xl border border-cocoa/24 bg-cream px-7 py-4 text-xs font-bold tracking-[0.2em] text-cocoa shadow-[0_14px_34px_rgba(140,106,90,0.14)] transition duration-1000 hover:bg-cocoa/12"
            >
              Shop the wardrobe
            </Link>
          </div>
        </section>

        <section className="bg-cocoa/10 px-5 py-20">
          <p className="text-sm font-bold uppercase tracking-[0.24em] text-cocoa">
            Wardrobe paths
          </p>
          <div className="mt-8 grid grid-cols-2 gap-5">
            {(categories.length > 0
              ? categories
              : [
                  { name: "Wardrobe", slug: "shop", imageMobileUrl: null, imageUrl: null },
                  { name: "Slow essentials", slug: "shop", imageMobileUrl: null, imageUrl: null },
                ]
            ).map((category) => {
              const tileImage = category.imageMobileUrl ?? category.imageUrl;
              return (
                <Link
                  key={category.slug}
                  href={
                    category.slug === "shop" ? "/shop" : `/shop/${category.slug}`
                  }
                  className="group block"
                >
                  {tileImage ? (
                    <div className="relative aspect-[3/4] overflow-hidden rounded-[22px] shadow-[0_18px_48px_rgba(43,38,35,0.08)] transition duration-1000 group-hover:scale-[1.015]">
                      <Image
                        src={tileImage}
                        alt={category.name}
                        fill
                        sizes="50vw"
                        className="object-cover"
                      />
                    </div>
                  ) : (
                    <div className="cloth-window aspect-[3/4] rounded-[22px] shadow-[0_18px_48px_rgba(43,38,35,0.08)] transition duration-1000 group-hover:scale-[1.015]" />
                  )}
                  <p className="mt-3 font-display text-2xl leading-tight text-maroon">
                    {category.name}
                  </p>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="px-5 py-24">
          <TwoVideoSection left={videoSlots.left} right={videoSlots.right} />
          <h2 className="mt-9 font-display text-[44px] leading-[1.05] text-maroon">
            Made to live in.
          </h2>
        </section>

        <section className="bg-cream px-5 py-24 text-center">
          <p className="text-sm font-bold uppercase tracking-[0.24em] text-cocoa">
            Versatility
          </p>
          <div className="mt-12 grid grid-cols-2 gap-x-6 gap-y-12">
            {rituals.map((ritual) => (
              <div
                key={ritual.label}
                className="flex flex-col items-center gap-4 text-cocoa"
              >
                <ritual.Icon
                  className="h-10 w-10 text-cocoa/80"
                  strokeWidth={1.25}
                  aria-hidden="true"
                />
                <p className="font-display text-xl leading-tight text-cocoa">
                  {ritual.label}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-cocoa/10 px-5 py-20">
          <p className="text-sm font-bold uppercase tracking-[0.24em] text-cocoa">
            {featuredEyebrow}
          </p>
          <ScrollRail className="mt-8">
            {(products.length > 0 ? products : [0, 1, 2]).map((item, index) => {
              const product = typeof item === "number" ? null : item;

              return (
                <Link
                  key={product?.id ?? index}
                  href={product ? `/product/${product.slug}` : "/shop"}
                  className="w-[250px] shrink-0 snap-center"
                >
                  {product?.image ? (
                    <div className="relative aspect-[3/4] overflow-hidden rounded-[22px] bg-cream">
                      <Image
                        src={videoPosterUrl(product.image.url)}
                        alt={product.image.altText ?? product.title}
                        fill
                        sizes="250px"
                        className="object-cover"
                      />
                    </div>
                  ) : (
                    <div className="cloth-window aspect-[3/4] rounded-[22px]" />
                  )}
                  <div className="mt-4">
                    <h2 className="font-display text-3xl text-maroon">
                      {product?.title ?? "A soft arrival is being prepared"}
                    </h2>
                    <p className="mt-1 text-sm text-charcoal/62">
                      {product?.fabric ?? "Collection details will unfold here"}
                    </p>
                    {product ? (
                      <p className="mt-1 text-sm text-charcoal/70">
                        {formatINR(product.basePrice)}
                      </p>
                    ) : null}
                  </div>
                </Link>
              );
            })}
          </ScrollRail>
        </section>

      </div>

      <div className="hidden md:block">
      <section className="paper-grain bg-cream pt-32">
        <HomepageCarousel
          banners={photoBanners}
          variant="inline"
          flush
          inlineClassName="aspect-[12/5]"
        />
        <div className="mx-auto max-w-3xl px-6 pb-20 pt-16 text-center">
          <h1 className="font-display text-[64px] leading-[1.02] text-maroon md:text-[80px]">
            Clothing made to live softly
          </h1>
          <Link
            href="/shop"
            className="mt-10 inline-flex items-center justify-center border border-cocoa/24 bg-cream px-8 py-4 text-[11px] font-bold tracking-[0.24em] text-cocoa shadow-[0_14px_34px_rgba(140,106,90,0.14)] transition duration-1000 hover:bg-cocoa/12"
          >
            Shop the wardrobe
          </Link>
        </div>
      </section>

      <section className="bg-cream px-6 py-20 md:py-28">
        <div className="mx-auto max-w-7xl">
          <TwoVideoSection left={videoSlots.left} right={videoSlots.right} />
          <h2 className="mt-10 max-w-3xl font-display text-[56px] leading-[1.05] text-maroon md:text-[72px]">
            Made to live in.
          </h2>
        </div>
      </section>

      <section className="bg-cream px-6 py-24 md:py-32">
        <div className="mx-auto max-w-5xl text-center">
          <p className="text-sm font-bold uppercase tracking-[0.24em] text-cocoa">
            Versatility
          </p>
          <div className="mx-auto mt-16 grid max-w-4xl gap-x-8 gap-y-16 sm:grid-cols-2 md:grid-cols-4">
            {rituals.map((ritual) => (
              <div
                key={ritual.label}
                className="flex flex-col items-center gap-5 text-cocoa"
              >
                <ritual.Icon
                  className="h-12 w-12 text-cocoa/80"
                  strokeWidth={1.25}
                  aria-hidden="true"
                />
                <p className="font-display text-2xl leading-tight text-cocoa">
                  {ritual.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-cream px-6 py-16 md:py-24">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.24em] text-cocoa">
                Wardrobe paths
              </p>
              <h2 className="mt-4 font-display text-[42px] leading-[1.1] text-maroon">
                Choose what feels close.
              </h2>
            </div>
            <Link
              href="/shop"
              className="soft-link my-8 w-fit py-3 text-sm font-bold uppercase tracking-[0.24em] text-maroon md:my-10"
            >
              Enter the wardrobe
            </Link>
          </div>

          {categories.length > 0 ? (
            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {categories.map((category) => (
                <Link
                  key={category.slug}
                  href={`/shop/${category.slug}`}
                  className="group block"
                >
                  {category.imageUrl ? (
                    <div className="relative aspect-[4/5] overflow-hidden shadow-[0_18px_55px_rgba(43,38,35,0.07)] transition duration-1000 group-hover:scale-[1.01]">
                      <Image
                        src={category.imageUrl}
                        alt={category.name}
                        fill
                        sizes="(min-width: 1024px) 25vw, 50vw"
                        className="object-cover"
                      />
                    </div>
                  ) : (
                    <div className="cloth-window aspect-[4/5] shadow-[0_18px_55px_rgba(43,38,35,0.07)] transition duration-1000 group-hover:scale-[1.01]" />
                  )}
                  <p className="mt-4 font-display text-3xl leading-tight text-maroon">
                    {category.name}
                  </p>
                </Link>
              ))}
            </div>
          ) : (
            <div className="mt-10 border border-cocoa/12 bg-cocoa/10 px-6 py-10 text-charcoal/64">
              <p className="max-w-xl text-base leading-8">
                Category tiles will appear here automatically after the backend
                returns categories from the database.
              </p>
            </div>
          )}
        </div>
      </section>

      <section className="bg-cocoa/10 px-6 py-16 md:py-24">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-2xl">
            <p className="text-sm font-bold uppercase tracking-[0.24em] text-cocoa">
              {featuredEyebrow}
            </p>
            <h2 className="mt-4 font-display text-[42px] leading-[1.1] text-maroon">
              {featuredHeading}
            </h2>
          </div>

          {products.length > 0 ? (
            <div className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              {products.map((product) => {
                const color = productColor(product);

                return (
                  <Link
                    key={product.id}
                    href={`/product/${product.slug}`}
                    className="group block"
                  >
                    {product.image ? (
                      <div className="relative aspect-[3/4] overflow-hidden bg-cream">
                        <Image
                          src={videoPosterUrl(product.image.url)}
                          alt={product.image.altText ?? product.title}
                          fill
                          sizes="(min-width: 1024px) 25vw, 50vw"
                          className="object-cover transition duration-1000 group-hover:scale-[1.01]"
                        />
                      </div>
                    ) : (
                      <div className="cloth-window aspect-[3/4] transition duration-1000 group-hover:scale-[1.01]" />
                    )}
                    <div className="mt-4 space-y-1 text-base leading-6 text-charcoal/66">
                      <div className="flex items-start justify-between gap-5 text-charcoal">
                        <h3 className="font-sans text-base font-normal">
                          {product.title}
                        </h3>
                        <p>{formatINR(product.basePrice)}</p>
                      </div>
                      {product.fabric ? <p>{product.fabric}</p> : null}
                      {color ? <p>{color}</p> : null}
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              {[0, 1, 2, 3].map((slot) => (
                <div key={slot}>
                  <div className="cloth-window aspect-[3/4]" />
                  <p className="mt-4 text-sm leading-6 text-charcoal/58">
                    A soft arrival is being prepared
                  </p>
                  <div className="mt-4 h-3 w-3/4 bg-cocoa/16" />
                  <div className="mt-3 h-3 w-1/2 bg-cocoa/14" />
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      </div>
    </>
  );
}
