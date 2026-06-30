import Link from "next/link";
import { HomepageCarousel, isVideo } from "@/components/storefront/homepage-carousel";
import { ScrollRail } from "@/components/storefront/scroll-rail";
import { getActiveBanners } from "@/lib/actions/banners";
import { getCategories, getNewArrivals } from "@/lib/actions/products";
import type { Product } from "@/lib/types";

function formatPrice(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
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

const rituals = [
  {
    label: "everyday wear",
    doodle: (
      <svg viewBox="0 0 72 72" aria-hidden="true" className="h-14 w-14">
        <path
          d="M24 21c4-5 8-7 12-7s8 2 12 7l10 7-8 10-5-4v20c0 2-1 3-3 3H30c-2 0-3-1-3-3V34l-5 4-8-10 10-7Z"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
        <path
          d="M31 17c1 4 3 6 5 6s4-2 5-6M27 42c6 2 12 2 18 0"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.6"
        />
      </svg>
    ),
  },
  {
    label: "intimate gatherings",
    doodle: (
      <svg viewBox="0 0 72 72" aria-hidden="true" className="h-14 w-14">
        <path
          d="M25 33c-5-1-9-5-9-10 0-6 5-10 10-8 3 1 5 4 6 8 1-4 4-7 8-8 6-1 11 4 10 10-1 8-10 15-18 22-3-3-6-5-9-8"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
        <path
          d="M45 39c6-1 11 2 11 7 0 6-7 10-15 10s-15-4-15-10c0-3 2-5 5-6"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.6"
        />
        <path
          d="M48 31c5 2 8 5 9 9"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.3"
        />
      </svg>
    ),
  },
  {
    label: "slow travel",
    doodle: (
      <svg viewBox="0 0 72 72" aria-hidden="true" className="h-14 w-14">
        <path
          d="M25 25h22c4 0 7 3 7 7v18c0 4-3 7-7 7H25c-4 0-7-3-7-7V32c0-4 3-7 7-7Z"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
        <path
          d="M29 25v-5c0-3 2-5 5-5h4c3 0 5 2 5 5v5M25 57v4M47 57v4M23 42c7 2 19 2 26-1"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.6"
        />
        <path
          d="M12 19c5-3 10-3 15-1M52 16c4 1 7 3 9 7"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.3"
        />
      </svg>
    ),
  },
  {
    label: "layered evenings",
    doodle: (
      <svg viewBox="0 0 72 72" aria-hidden="true" className="h-14 w-14">
        <path
          d="M18 42c8-6 18-9 36-9v16c-15 0-25 2-36 8V42Z"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
        <path
          d="M18 33c9-6 20-9 36-9M18 25c8-5 18-8 31-8M27 50c8-3 16-4 25-4"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.6"
        />
        <path
          d="M49 14c1 3 3 5 6 6-3 1-5 3-6 6-1-3-3-5-6-6 3-1 5-3 6-6Z"
          fill="none"
          stroke="currentColor"
          strokeLinejoin="round"
          strokeWidth="1.4"
        />
      </svg>
    ),
  },
];

const journalNotes = [
  {
    href: "/journal/styling-rituals",
    title: "styling rituals",
    copy: "A quiet space for wearing notes once the first collection is ready.",
  },
  {
    href: "/journal/wearing-notes",
    title: "wearing notes",
    copy: "Notes on carrying Aarna into homes, gatherings, streets, and travel.",
  },
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
          <div className="reveal-up px-5 pb-14 pt-12 text-center">
            <h1 className="font-display text-[52px] lowercase leading-[0.98] text-maroon">
              clothing made to live softly
            </h1>
            <Link
              href="/collections"
              className="mt-8 inline-flex rounded-2xl border border-cocoa/24 bg-cream px-7 py-4 text-xs font-bold lowercase tracking-[0.2em] text-cocoa shadow-[0_14px_34px_rgba(140,106,90,0.14)] transition duration-1000 hover:bg-cocoa/12"
            >
              collections
            </Link>
          </div>
        </section>

        <section className="reveal-up bg-cocoa/10 px-5 py-20">
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
            ).map((category, index) => (
              <Link
                key={category.slug}
                href={
                  category.slug === "shop" ? "/shop" : `/shop/${category.slug}`
                }
                className={`reveal-up reveal-stagger-${(index % 3) + 1} group block`}
              >
                <div className="cloth-window aspect-[3/4] rounded-[22px] shadow-[0_18px_48px_rgba(43,38,35,0.08)] transition duration-1000 group-hover:scale-[1.015]" />
                <p className="mt-3 font-display text-2xl lowercase leading-tight text-maroon">
                  {category.name.toLowerCase()}
                </p>
              </Link>
            ))}
          </div>
        </section>

        <section className="reveal-up px-5 py-24">
          <HomepageCarousel
            banners={videoBanners}
            variant="inline"
            inlineClassName="h-[260px]"
          />
          <h2 className="mt-9 font-display text-[44px] lowercase leading-[1.05] text-maroon">
            made to live in.
          </h2>
        </section>

        <section className="reveal-up bg-cream px-5 py-20">
          <p className="text-sm font-bold uppercase tracking-[0.24em] text-cocoa">
            versatility
          </p>
          <div className="mt-6 flex snap-x gap-3 overflow-x-auto border-y border-cocoa/16 py-5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {rituals.map((ritual) => (
              <div
                key={ritual.label}
                className="flex min-w-[168px] snap-center items-center gap-3 text-cocoa"
              >
                <div className="hand-doodle shrink-0 text-cocoa/80 [&_svg]:h-9 [&_svg]:w-9">
                  {ritual.doodle}
                </div>
                <p className="font-display text-xl lowercase leading-tight text-cocoa">
                  {ritual.label}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="reveal-up bg-cocoa/10 px-5 py-20">
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
                  className="reveal-up w-[250px] shrink-0 snap-center"
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
                        {formatPrice(product.basePrice)}
                      </p>
                    ) : null}
                  </div>
                </Link>
              );
            })}
          </ScrollRail>
        </section>

        <section className="reveal-up px-5 py-20">
          <p className="text-sm font-bold uppercase tracking-[0.24em] text-cocoa">
            journal
          </p>
          <div className="mt-8 space-y-5">
            {journalNotes.map((note) => (
              <Link
                key={note.href}
                href={note.href}
                className="reveal-up block rounded-[22px] border border-cocoa/12 bg-cocoa/10 p-5"
              >
                <div className="cloth-window h-40 rounded-[18px]" />
                <h2 className="mt-5 font-display text-3xl lowercase text-maroon">
                  {note.title}
                </h2>
                <p className="mt-3 text-sm leading-6 text-charcoal/64">
                  {note.copy}
                </p>
              </Link>
            ))}
          </div>
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
        <div className="fade-rise mx-auto max-w-3xl px-6 pb-20 pt-16 text-center">
          <h1 className="font-display text-[64px] lowercase leading-[1.02] text-maroon md:text-[80px]">
            clothing made to live softly
          </h1>
          <Link
            href="/collections"
            className="mt-10 inline-flex items-center justify-center border border-cocoa/24 bg-cream px-8 py-4 text-[11px] font-bold lowercase tracking-[0.24em] text-cocoa shadow-[0_14px_34px_rgba(140,106,90,0.14)] transition duration-1000 hover:bg-cocoa/12"
          >
            collections
          </Link>
        </div>
      </section>

      <section className="reveal-up bg-cream px-6 py-20 md:py-28">
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

      <section className="reveal-up bg-cream px-6 py-16 md:py-24">
        <div className="mx-auto max-w-5xl text-center">
          <p className="text-sm font-bold uppercase tracking-[0.24em] text-cocoa">
            versatility
          </p>
          <h2 className="mt-5 font-display text-[42px] lowercase leading-[1.1] text-maroon md:text-[58px]">
            pieces that move through the day without asking to be noticed.
          </h2>
          <div className="mx-auto mt-9 grid max-w-3xl gap-4 border-y border-cocoa/16 py-7 sm:grid-cols-2 md:grid-cols-4">
            {rituals.map((ritual) => (
              <div key={ritual.label} className="flex flex-col items-center gap-3 text-cocoa">
                <div className="hand-doodle text-cocoa/80">
                  {ritual.doodle}
                </div>
                <p className="font-display text-2xl lowercase leading-tight text-cocoa">
                  {ritual.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="reveal-up bg-cream px-6 py-16 md:py-24">
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
                  className="reveal-up group block"
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

      <section className="reveal-up bg-cocoa/10 px-6 py-16 md:py-24">
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
                    className="reveal-up group block"
                  >
                    <div className="cloth-window aspect-[3/4] transition duration-1000 group-hover:scale-[1.01]" />
                    <div className="mt-4 space-y-1 text-base leading-6 text-charcoal/66">
                      <div className="flex items-start justify-between gap-5 text-charcoal">
                        <h3 className="font-sans text-base font-normal">
                          {product.title}
                        </h3>
                        <p>{formatPrice(product.basePrice)}</p>
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
                <div key={slot} className={`reveal-up reveal-stagger-${(slot % 3) + 1}`}>
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

      <section className="paper-grain reveal-up bg-cream px-6 py-16 text-charcoal md:py-24">
        <div className="mx-auto grid max-w-7xl gap-12 md:grid-cols-[0.9fr_1.1fr] md:items-end">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.24em] text-cocoa">
              journal
            </p>
            <h2 className="mt-4 max-w-lg font-display text-5xl lowercase leading-[1.08] text-maroon md:text-6xl">
              notes for wearing slowly.
            </h2>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            {journalNotes.map((note) => (
              <Link
                key={note.href}
                href={note.href}
                className="reveal-up border border-cocoa/14 bg-cocoa/10 p-6 text-charcoal shadow-[0_18px_55px_rgba(43,38,35,0.05)] transition duration-1000 hover:bg-cocoa/15 hover:text-cocoa"
              >
                <p className="font-display text-3xl lowercase leading-tight text-maroon">
                  {note.title}
                </p>
                <p className="mt-5 text-base leading-7 text-current/72">
                  {note.copy}
                </p>
              </Link>
            ))}
          </div>
        </div>
      </section>
      </div>
    </>
  );
}
