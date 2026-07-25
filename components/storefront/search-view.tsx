"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Check,
  Clock,
  Heart,
  Plus,
  Search,
  Shirt,
  ShoppingBag,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useRecentSearches } from "@/store/recent-searches";
import { useCartCount } from "@/store/cart-count";
import { addToCart } from "@/lib/actions/cart";
import {
  addToWishlist,
  getWishlistedVariantIds,
  removeFromWishlist,
} from "@/lib/actions/account";
import { formatINR } from "@/lib/utils";

interface SearchProduct {
  id: string;
  title: string;
  slug: string;
  basePrice: number;
  mrp: number | null;
  image: { url: string; altText: string | null } | null;
  fabric: string | null;
  defaultVariantId: string | null;
  /** Which category this product actually belongs to — needed so searching
   *  a category NAME can match by real membership, not just by whether that
   *  name happens to appear inside a product's title (see matchedProducts:
   *  it almost never does — "Dresses" the category vs. "Beige Aura Dress"
   *  the product title). */
  categorySlug: string | null;
}

interface SearchCategory {
  name: string;
  slug: string;
  imageUrl: string | null;
}

interface SearchViewProps {
  categories: SearchCategory[];
  products: SearchProduct[];
  initialQuery?: string;
}

// Static picks only — category picks are appended from the categories prop at
// render (dynamic-categories rule: /shop/bestsellers and /shop/new-arrivals
// aren't real categories and 404'd).
const QUICK_PICKS = [
  { label: "Continue shopping", href: "/shop", Icon: ShoppingBag },
  { label: "Recently viewed", href: "/shop", Icon: Clock },
];

// A dress silhouette — Lucide (checked the full ~1950-icon set first) has no
// literal dress/gown/skirt icon, so this is a small hand-drawn one matching
// Lucide's own conventions (24x24, 2px stroke, round caps/joins, currentColor)
// rather than reaching for a mismatched generic icon.
function DressIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M9 3.5 7 7l1.6 2-1.8 10.5a1 1 0 0 0 1 1.5h8.4a1 1 0 0 0 1-1.5L15.4 9l1.6-2-2-3.5" />
      <path d="M9 3.5c1 .8 2 .8 3 0M12 3.5c1 .8 2 .8 3 0" />
      <path d="M9.3 9h5.4" />
    </svg>
  );
}

// Matched by category identity (slug), never by array position — a category
// added later that isn't one of these two falls through to a neutral generic
// icon instead of silently inheriting whatever happened to be left over.
const CATEGORY_ICON_BY_SLUG: Record<string, LucideIcon | typeof DressIcon> = {
  dresses: DressIcon,
  tops: Shirt,
};
function categoryIcon(slug: string): LucideIcon | typeof DressIcon {
  return CATEGORY_ICON_BY_SLUG[slug] ?? ShoppingBag;
}

export function SearchView({
  categories,
  products,
  initialQuery = "",
}: SearchViewProps) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const recent = useRecentSearches((s) => s.items);
  const addRecent = useRecentSearches((s) => s.add);
  const removeRecent = useRecentSearches((s) => s.remove);
  const clearRecent = useRecentSearches((s) => s.clear);
  const [wished, setWished] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);

  // Hydrate real wishlist membership on mount — this used to start empty
  // unconditionally, so a product already saved from a previous visit
  // always showed an empty heart here until toggled again in that session.
  useEffect(() => {
    let cancelled = false;
    getWishlistedVariantIds().then((ids) => {
      if (cancelled) return;
      setWished(new Set(ids));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function flashToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast((t) => (t === message ? null : t)), 2200);
  }

  const trimmed = query.trim();
  const isSearching = trimmed.length > 0;

  const matchedCategories = useMemo(() => {
    if (!isSearching) return [];
    const q = trimmed.toLowerCase();
    return categories.filter((c) => c.name.toLowerCase().includes(q));
  }, [categories, trimmed, isSearching]);

  const matchedProducts = useMemo(() => {
    if (!isSearching) return [];
    const q = trimmed.toLowerCase();
    // Real category membership, not just whether the category's name
    // happens to appear inside a title — it essentially never does
    // ("Dresses" the category vs. "Beige Aura Dress" the product title),
    // which is exactly why searching or clicking a category used to always
    // land on "No products found" even when it genuinely has products.
    const matchedSlugs = new Set(matchedCategories.map((c) => c.slug));
    return products.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        (p.fabric ?? "").toLowerCase().includes(q) ||
        (p.categorySlug !== null && matchedSlugs.has(p.categorySlug)),
    );
  }, [products, trimmed, isSearching, matchedCategories]);

  const recommended = useMemo(() => products.slice(0, 8), [products]);

  function commitSearch(term: string) {
    const t = term.trim();
    if (!t) return;
    addRecent(t);
    setQuery(t);
    router.replace(`/search?q=${encodeURIComponent(t)}`, { scroll: false });
  }

  // Wishlist is server-backed (lib/actions/account) so it follows the signed-in
  // customer everywhere (PDP, account page) — same pattern as product-detail-view
  // and cart-view's moveToWishlist. Optimistic toggle, rolled back on failure.
  async function toggleWish(product: SearchProduct) {
    if (!product.defaultVariantId) return;
    const wasWished = wished.has(product.id);
    setWished((prev) => {
      const next = new Set(prev);
      if (wasWished) next.delete(product.id);
      else next.add(product.id);
      return next;
    });
    try {
      if (wasWished) {
        await removeFromWishlist(product.defaultVariantId);
      } else {
        await addToWishlist(product.defaultVariantId);
        flashToast("Saved to wishlist");
      }
    } catch {
      setWished((prev) => {
        const next = new Set(prev);
        if (wasWished) next.add(product.id);
        else next.delete(product.id);
        return next;
      });
      flashToast("Sign in to save to wishlist");
      router.push(`/login/otp?next=${encodeURIComponent("/search")}`);
    }
  }

  async function quickAdd(product: SearchProduct): Promise<boolean> {
    if (!product.defaultVariantId) return false;
    try {
      const next = await addToCart(product.defaultVariantId, 1);
      useCartCount.getState().set(next.itemCount);
      return true;
    } catch {
      return false;
    }
  }

  return (
    <section className="paper-grain min-h-screen bg-cream pb-24 pt-[128px] md:pt-32">
      {/* Sticky search bar */}
      <div className="sticky top-[120px] z-30 border-b border-maroon/8 bg-cream/85 px-5 py-3.5 backdrop-blur-xl md:top-[116px] md:px-6">
        <div className="mx-auto flex max-w-3xl items-center gap-3 rounded-full border border-cocoa/20 bg-cream px-5 py-3 shadow-[0_10px_30px_rgba(43,38,35,0.05)] transition duration-500 focus-within:border-cocoa">
          <Search
            className="h-[18px] w-[18px] shrink-0 text-cocoa"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitSearch(query);
            }}
            placeholder="Search for pieces, categories…"
            aria-label="Search"
            autoComplete="off"
            className="w-full appearance-none bg-transparent text-base text-charcoal outline-none placeholder:text-charcoal/40 [&::-webkit-search-cancel-button]:hidden"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-cocoa/60 transition duration-500 hover:bg-cocoa/10 hover:text-cocoa"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-5 pt-9 md:px-6 md:pt-12">
        {isSearching ? (
          <div key={trimmed}>
            {matchedCategories.length > 0 ? (
              <section className="mb-12">
                <SectionLabel>Categories</SectionLabel>
                <div className="mt-5 flex flex-wrap gap-2.5">
                  {matchedCategories.map((c) => (
                    <Link
                      key={c.slug}
                      href={`/shop/${c.slug}`}
                      className="rounded-full border border-cocoa/20 bg-cocoa/5 px-5 py-2.5 transition duration-500 hover:-translate-y-0.5 hover:border-cocoa/35 hover:bg-cocoa/10"
                    >
                      <span className="text-sm text-charcoal/80">
                        <Highlight text={c.name} query={trimmed} />
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            ) : null}

            {matchedProducts.length > 0 ? (
              <section>
                <SectionLabel>
                  {matchedProducts.length}{" "}
                  {matchedProducts.length === 1 ? "result" : "results"} for
                  &ldquo;{trimmed}&rdquo;
                </SectionLabel>
                <div className="mt-7 grid grid-cols-2 gap-x-5 gap-y-9 sm:grid-cols-3 lg:grid-cols-4">
                  {matchedProducts.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      query={trimmed}
                      wished={wished.has(product.id)}
                      onWish={() => toggleWish(product)}
                      onAdd={() => quickAdd(product)}
                    />
                  ))}
                </div>
              </section>
            ) : (
              <EmptyResults
                categories={categories}
                onPick={(name) => commitSearch(name)}
              />
            )}
          </div>
        ) : (
          <div className="space-y-14 md:space-y-20">
            {/* Quick Picks */}
            <section>
              <SectionLabel>Quick picks</SectionLabel>
              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ...QUICK_PICKS,
                  ...categories.slice(0, 2).map((c) => ({
                    label: c.name,
                    href: `/shop/${c.slug}`,
                    Icon: categoryIcon(c.slug),
                  })),
                ].map(({ label, href, Icon }) => (
                  <Link
                    key={label}
                    href={href}
                    className="group flex items-center gap-3 rounded-2xl border border-cocoa/14 bg-cream/70 px-4 py-4 shadow-[0_10px_30px_rgba(43,38,35,0.04)] transition duration-500 hover:-translate-y-0.5 hover:border-cocoa/25 hover:shadow-[0_18px_44px_rgba(43,38,35,0.08)]"
                  >
                    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cocoa/10 text-cocoa">
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-charcoal/72">
                      {label}
                    </span>
                    <ArrowRight className="ml-auto h-3.5 w-3.5 text-cocoa/45 transition duration-500 group-hover:translate-x-0.5 group-hover:text-cocoa" />
                  </Link>
                ))}
              </div>
            </section>

            {/* Recent Searches */}
            {recent.length > 0 ? (
              <section>
                <div className="flex items-center justify-between gap-4">
                  <SectionLabel>Recent searches</SectionLabel>
                  <button
                    type="button"
                    onClick={clearRecent}
                    className="soft-link text-[11px] font-semibold uppercase tracking-[0.16em] text-cocoa/70 hover:text-cocoa"
                  >
                    Clear all
                  </button>
                </div>
                <div className="mt-5 flex flex-wrap gap-2.5">
                  {recent.map((term) => (
                    <span
                      key={term}
                      className="group inline-flex items-center gap-2 rounded-full border border-cocoa/18 bg-cream px-4 py-2 shadow-[0_6px_18px_rgba(43,38,35,0.04)] transition duration-500 hover:border-cocoa/30"
                    >
                      <button
                        type="button"
                        onClick={() => commitSearch(term)}
                        className="text-sm text-charcoal/80 transition duration-500 group-hover:text-maroon"
                      >
                        {term}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeRecent(term)}
                        aria-label={`Remove ${term}`}
                        className="-m-2 inline-flex h-8 w-8 items-center justify-center text-cocoa/45 transition duration-500 hover:text-burnt-red"
                      >
                        <X className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </span>
                  ))}
                </div>
              </section>
            ) : null}

            {/* Trending Searches (existing categories) */}
            {categories.length > 0 ? (
              <section>
                <SectionLabel>Trending searches</SectionLabel>
                <div className="mt-5 flex flex-wrap gap-2.5">
                  {categories.map((c) => (
                    <button
                      key={c.slug}
                      type="button"
                      onClick={() => commitSearch(c.name)}
                      className="rounded-full border border-cocoa/20 bg-cocoa/5 px-5 py-2.5 text-sm text-charcoal/80 transition duration-500 hover:-translate-y-0.5 hover:border-cocoa/35 hover:bg-cocoa/10 hover:text-maroon"
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            {/* Shop by Category */}
            {categories.length > 0 ? (
              <section>
                <SectionLabel>Shop by category</SectionLabel>
                <div className="mt-7 flex flex-wrap justify-center gap-5 sm:gap-6">
                  {categories.map((c) => (
                    <Link
                      key={c.slug}
                      href={`/shop/${c.slug}`}
                      className="group block w-[calc(50%-10px)] sm:w-[230px]"
                    >
                      <div className="relative aspect-[4/5] overflow-hidden rounded-[20px] shadow-[0_16px_44px_rgba(43,38,35,0.07)] transition duration-500 group-hover:scale-[1.01]">
                        {c.imageUrl ? (
                          <Image
                            src={c.imageUrl}
                            alt={c.name}
                            fill
                            sizes="(min-width: 640px) 230px, 50vw"
                            className="object-cover"
                          />
                        ) : (
                          <div className="cloth-window h-full w-full" />
                        )}
                      </div>
                      <p className="mt-3.5 font-display text-2xl leading-tight text-maroon">
                        {c.name}
                      </p>
                    </Link>
                  ))}
                </div>
              </section>
            ) : null}

            {/* Recommended For You */}
            {recommended.length > 0 ? (
              <section>
                <SectionLabel>Recommended for you</SectionLabel>
                <div className="mt-7 flex snap-x gap-5 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {recommended.map((product) => (
                    <div key={product.id} className="w-[200px] shrink-0 snap-start md:w-[230px]">
                      <ProductCard
                        product={product}
                        query=""
                        wished={wished.has(product.id)}
                        onWish={() => toggleWish(product)}
                        onAdd={() => quickAdd(product)}
                      />
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        )}
      </div>

      {/* Wishlist confirmation */}
      <div
        aria-live="polite"
        className={`pointer-events-none fixed inset-x-0 z-[60] flex justify-center px-4 transition-all duration-500 ${
          toast ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
        }`}
        style={{ bottom: "calc(1.5rem + env(safe-area-inset-bottom))" }}
      >
        {toast ? (
          <div className="flex items-center gap-2 rounded-full border border-maroon/10 bg-cream/95 px-5 py-3 text-xs tracking-wide text-maroon shadow-[0_18px_50px_rgba(43,38,35,0.16)] backdrop-blur-xl">
            <Heart className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
            {toast}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-sm font-bold uppercase tracking-[0.24em] text-cocoa">
      {children}
    </p>
  );
}

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-transparent font-semibold text-maroon">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

function ProductCard({
  product,
  query,
  wished,
  onWish,
  onAdd,
}: {
  product: SearchProduct;
  query: string;
  wished: boolean;
  onWish: () => void;
  onAdd: () => Promise<boolean>;
}) {
  const [justAdded, setJustAdded] = useState(false);
  const [adding, setAdding] = useState(false);

  const onSale =
    typeof product.mrp === "number" && product.mrp > product.basePrice;
  const discountPct = onSale
    ? Math.round(((product.mrp! - product.basePrice) / product.mrp!) * 100)
    : 0;

  async function handleAdd() {
    if (adding) return;
    setAdding(true);
    const ok = await onAdd();
    setAdding(false);
    if (ok) {
      setJustAdded(true);
      window.setTimeout(() => setJustAdded(false), 1600);
    }
  }

  return (
    <div className="group">
      <div className="relative aspect-[3/4] overflow-hidden rounded-[20px] shadow-[0_14px_40px_rgba(43,38,35,0.06)]">
        <Link
          href={`/product/${product.slug}`}
          aria-label={product.title}
          className="block h-full w-full"
        >
          {product.image?.url ? (
            <Image
              src={product.image.url}
              alt={product.image.altText ?? product.title}
              fill
              sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
              className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
            />
          ) : (
            <div className="cloth-window h-full w-full transition duration-500 group-hover:scale-[1.03]" />
          )}
        </Link>
        {onSale ? (
          <span className="absolute left-3 top-3 rounded-full border border-cream/60 bg-cream/95 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-burnt-red shadow-[0_8px_20px_rgba(43,38,35,0.06)] backdrop-blur-md">
            {discountPct}% off
          </span>
        ) : null}
        <button
          type="button"
          onClick={onWish}
          aria-label={wished ? "Remove from wishlist" : "Add to wishlist"}
          aria-pressed={wished}
          className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full border border-maroon/8 bg-cream/85 text-maroon shadow-[0_8px_20px_rgba(43,38,35,0.08)] backdrop-blur-md transition duration-500 hover:scale-105"
        >
          <Heart
            className={`h-4 w-4 transition duration-500 ${
              wished ? "fill-burnt-red text-burnt-red" : ""
            }`}
            aria-hidden="true"
          />
        </button>
        <button
          type="button"
          onClick={handleAdd}
          disabled={!product.defaultVariantId || adding}
          aria-label={product.defaultVariantId ? "Add to bag" : "Out of stock"}
          className={`absolute inset-x-3 bottom-3 flex min-h-11 items-center justify-center gap-2 rounded-full bg-maroon shadow-[0_12px_28px_rgba(74,31,31,0.25)] transition-all duration-500 disabled:cursor-not-allowed disabled:opacity-60 ${
            justAdded
              ? "translate-y-0 opacity-100"
              : "opacity-100 md:translate-y-2 md:opacity-0 md:group-hover:translate-y-0 md:group-hover:opacity-100"
          }`}
        >
          <span className="flex items-center gap-2 text-[11px] font-medium tracking-[0.18em] text-cream">
            {justAdded ? (
              <>
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                Added to bag
              </>
            ) : !product.defaultVariantId ? (
              "Out of stock"
            ) : (
              <>
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                Add to bag
              </>
            )}
          </span>
        </button>
      </div>
      <Link href={`/product/${product.slug}`} className="mt-3.5 block">
        <h3 className="font-sans text-sm font-normal leading-snug text-charcoal">
          <Highlight text={product.title} query={query} />
        </h3>
        <p className="mt-1 flex items-baseline gap-1.5 text-sm text-charcoal/65">
          <span>{formatINR(product.basePrice)}</span>
          {onSale ? (
            <span className="text-xs text-charcoal/45 line-through">
              {formatINR(product.mrp!)}
            </span>
          ) : null}
        </p>
      </Link>
    </div>
  );
}

function EmptyResults({
  categories,
  onPick,
}: {
  categories: SearchCategory[];
  onPick: (name: string) => void;
}) {
  return (
    <div className="flex flex-col items-center px-4 py-16 text-center md:py-24">
      <span className="inline-flex h-16 w-16 items-center justify-center rounded-full border border-cocoa/20 text-cocoa">
        <Search className="h-6 w-6" aria-hidden="true" />
      </span>
      <h2 className="mt-7 font-display text-[34px] leading-[1.1] text-maroon md:text-5xl">
        No products found
      </h2>
      <p className="mt-4 max-w-sm text-base leading-7 text-charcoal/60">
        Try a different keyword or browse one of our categories.
      </p>
      {categories.length > 0 ? (
        <div className="mt-8 flex flex-wrap justify-center gap-2.5">
          {categories.map((c) => (
            <button
              key={c.slug}
              type="button"
              onClick={() => onPick(c.name)}
              className="rounded-full border border-cocoa/20 bg-cocoa/5 px-5 py-2.5 text-sm text-charcoal/80 transition duration-500 hover:-translate-y-0.5 hover:border-cocoa/35 hover:bg-cocoa/10 hover:text-maroon"
            >
              {c.name}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
