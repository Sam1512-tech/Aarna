import Link from "next/link";
import { Feather, Infinity, ShieldCheck, Sparkles } from "lucide-react";
import { HomepageCarousel, isVideo } from "@/components/storefront/homepage-carousel";
import { ScrollRail } from "@/components/storefront/scroll-rail";
import { getActiveBanners } from "@/lib/actions/banners";
import { getCategories, getNewArrivals } from "@/lib/actions/products";
import type { Product } from "@/lib/types";
import { formatINR } from "@/lib/utils";

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
  { label: "everyday comfort", Icon: Feather },
  { label: "timeless design", Icon: Infinity },
  { label: "premium fabrics", Icon: Sparkles },
  { label: "made to last", Icon: ShieldCheck },
];

export default async function HomePage() {
  const [categories, products, banners] = await Promise.all([
    getCategories(),
    getNewArrivals(4),
    getActiveBanners(),
  ]);

  const carouselBanners = banners.map((b) => ({
    id: b.id,
    imageUrl: b.imageUrl,
    mobileImageUrl: b.mobileImageUrl,
    title: b.title,
    subtitle: b.subtitle,
    ctaLabel: b.ctaLabel,
    ctaHref: b.ctaHref,
  }));
  // Split by media type: photos drive the hero banner under the nav, videos
  // drive the in-content carousel inside the "made to live in" section.
  const photoBanners = carouselBanners.filter((b) => !isVideo(b.imageUrl));
  const videoBanners = carouselBanners.filter((b) => isVideo(b.imageUrl));

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
            <h1 className="font-display text-[52px] lowercase leading-[0.98] text-maroon">
              clothing made to live softly
            </h1>
            <Link
              href="/shop"
              className="mt-8 inline-flex rounded-2xl border border-cocoa/24 bg-cream px-7 py-4 text-xs font-bold lowercase tracking-[0.2em] text-cocoa shadow-[0_14px_34px_rgba(140,106,90,0.14)] transition duration-1000 hover:bg-cocoa/12"
            >
              shop the wardrobe
            </Link>
          </div>
        </section>

        <section className="bg-cocoa/10 px-5 py-20">
          <p className="text-sm font-bold uppercase tracking-[0.24em] text-cocoa">
            wardrobe paths
          </p>
          <div className="mt-8 grid grid-cols-2 gap-5">
            {(categories.length > 0
              ? categories
              : [
                  { name: "wardrobe", slug: "shop" },
                  { name: "slow essentials", slug: "shop" },
                ]
            ).map((category) => (
              <Link
                key={category.slug}
                href={
                  category.slug === "shop" ? "/shop" : `/shop/${category.slug}`
                }
                className="group block"
              >
                <div className="cloth-window aspect-[3/4] rounded-[22px] shadow-[0_18px_48px_rgba(43,38,35,0.08)] transition duration-1000 group-hover:scale-[1.015]" />
                <p className="mt-3 font-display text-2xl lowercase leading-tight text-maroon">
                  {category.name.toLowerCase()}
                </p>
              </Link>
            ))}
          </div>
        </section>

        <section className="px-5 py-24">
          <HomepageCarousel
            banners={videoBanners}
            variant="inline"
            inlineClassName="h-[260px]"
          />
          <h2 className="mt-9 font-display text-[44px] lowercase leading-[1.05] text-maroon">
            made to live in.
          </h2>
        </section>

        <section className="bg-cream px-5 py-24 text-center">
          <p className="text-sm font-bold uppercase tracking-[0.24em] text-cocoa">
            versatility
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
                <p className="font-display text-xl lowercase leading-tight text-cocoa">
                  {ritual.label}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-cocoa/10 px-5 py-20">
          <p className="text-sm font-bold uppercase tracking-[0.24em] text-cocoa">
            featured collection
          </p>
          <ScrollRail className="mt-8">
            {(products.length > 0 ? products : [0, 1, 2]).map((item, index) => {
              const product = typeof item === "number" ? null : item;

              return (
                <Link
                  key={product?.id ?? index}
                  href={product ? `/products/${product.slug}` : "/shop"}
                  className="w-[250px] shrink-0 snap-center"
                >
                  <div className="cloth-window aspect-[3/4] rounded-[22px]" />
                  <div className="mt-4">
                    <h2 className="font-display text-3xl lowercase text-maroon">
                      {product?.title ?? "a soft arrival is being prepared"}
                    </h2>
                    <p className="mt-1 text-sm lowercase text-charcoal/62">
                      {product?.fabric ?? "collection details will unfold here"}
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
          <h1 className="font-display text-[64px] lowercase leading-[1.02] text-maroon md:text-[80px]">
            clothing made to live softly
          </h1>
          <Link
            href="/shop"
            className="mt-10 inline-flex items-center justify-center border border-cocoa/24 bg-cream px-8 py-4 text-[11px] font-bold lowercase tracking-[0.24em] text-cocoa shadow-[0_14px_34px_rgba(140,106,90,0.14)] transition duration-1000 hover:bg-cocoa/12"
          >
            shop the wardrobe
          </Link>
        </div>
      </section>

      <section className="bg-cream px-6 py-20 md:py-28">
        <div className="mx-auto max-w-7xl">
          <HomepageCarousel
            banners={videoBanners}
            variant="inline"
            inlineClassName="h-[420px] md:h-[520px]"
          />
          <h2 className="mt-10 max-w-3xl font-display text-[56px] lowercase leading-[1.05] text-maroon md:text-[72px]">
            made to live in.
          </h2>
        </div>
      </section>

      <section className="bg-cream px-6 py-24 md:py-32">
        <div className="mx-auto max-w-5xl text-center">
          <p className="text-sm font-bold uppercase tracking-[0.24em] text-cocoa">
            versatility
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
                <p className="font-display text-2xl lowercase leading-tight text-cocoa">
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
                wardrobe paths
              </p>
              <h2 className="mt-4 font-display text-[42px] lowercase leading-[1.1] text-maroon">
                choose what feels close.
              </h2>
            </div>
            <Link
              href="/shop"
              className="soft-link my-8 w-fit py-3 text-sm font-bold uppercase tracking-[0.24em] text-maroon md:my-10"
            >
              enter the wardrobe
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
                  <div className="cloth-window aspect-[4/5] shadow-[0_18px_55px_rgba(43,38,35,0.07)] transition duration-1000 group-hover:scale-[1.01]" />
                  <p className="mt-4 font-display text-3xl lowercase leading-tight text-maroon">
                    {category.name.toLowerCase()}
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
              featured collection
            </p>
            <h2 className="mt-4 font-display text-[42px] lowercase leading-[1.1] text-maroon">
              slow essentials, taking shape for the first chapter.
            </h2>
          </div>

          {products.length > 0 ? (
            <div className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              {products.map((product) => {
                const color = productColor(product);

                return (
                  <Link
                    key={product.id}
                    href={`/products/${product.slug}`}
                    className="group block"
                  >
                    <div className="cloth-window aspect-[3/4] transition duration-1000 group-hover:scale-[1.01]" />
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
                  <p className="mt-4 text-sm lowercase leading-6 text-charcoal/58">
                    a soft arrival is being prepared
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
