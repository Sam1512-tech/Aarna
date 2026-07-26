"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, SlidersHorizontal, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  ProductCard,
  type ProductCardData,
} from "@/components/storefront/product-card";
import {
  addToWishlist,
  getWishlistedVariantIds,
  removeFromWishlist,
} from "@/lib/actions/account";
import { useModalLock } from "@/hooks/use-modal-lock";

export type SortOption = "newest" | "price_asc" | "price_desc";

export interface PlpCategory {
  name: string;
  slug: string;
}

interface PlpViewProps {
  /** Section eyebrow — typically "the wardrobe" or category name */
  eyebrow: string;
  /** Big serif heading */
  title: string;
  /** Optional intro line under the title */
  intro?: string;
  /** The products to render on this page */
  products: ProductCardData[];
  /** Total matching products (for the count + pagination math) */
  total: number;
  /** Current page (1-indexed) */
  page: number;
  /** Items per page */
  pageSize: number;
  /** Base path for filter links and pagination — e.g. "/shop" or "/shop/dresses" */
  basePath: string;
  /** Categories for the filter sidebar (cross-nav) */
  categories: PlpCategory[];
  /** When set, the matching sidebar category is highlighted */
  activeCategorySlug?: string | null;
}

const SORT_LABELS: Record<SortOption, string> = {
  newest: "Newest",
  price_asc: "Price · low to high",
  price_desc: "Price · high to low",
};

export function PlpView({
  eyebrow,
  title,
  intro,
  products,
  total,
  page,
  pageSize,
  basePath,
  categories,
  activeCategorySlug = null,
}: PlpViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [wished, setWished] = useState<Set<string>>(new Set());

  // Hydrate real wishlist membership once on mount — same fix as PDP/search
  // (product-detail-view.tsx, search-view.tsx): without this every heart
  // here would start empty regardless of the customer's actual wishlist.
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

  function toggleWish(variantId: string) {
    const wasWished = wished.has(variantId);
    setWished((prev) => {
      const next = new Set(prev);
      if (wasWished) next.delete(variantId);
      else next.add(variantId);
      return next;
    });
    (wasWished ? removeFromWishlist(variantId) : addToWishlist(variantId)).catch(
      () => {
        // Most likely not signed in — revert and send them to sign in,
        // same pattern PDP/search/cart already use for this exact failure.
        setWished((prev) => {
          const next = new Set(prev);
          if (wasWished) next.add(variantId);
          else next.delete(variantId);
          return next;
        });
        router.push(
          `/login/otp?next=${encodeURIComponent(basePath)}`,
        );
      },
    );
  }

  const currentSort = (searchParams.get("sort") as SortOption) || "newest";
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // URL helper — preserves all current params, replaces the listed ones.
  const buildUrl = useCallback(
    (
      patch: Partial<Record<"sort" | "page" | "min" | "max", string | null>>,
    ) => {
      const next = new URLSearchParams(searchParams.toString());
      Object.entries(patch).forEach(([k, v]) => {
        if (v === null || v === "") next.delete(k);
        else next.set(k, v);
      });
      // Changing sort or filters drops you back to page 1 unless explicitly
      // overriding 'page' in the patch.
      if (
        ("sort" in patch || "min" in patch || "max" in patch) &&
        !("page" in patch)
      ) {
        next.delete("page");
      }
      const qs = next.toString();
      return qs ? `${basePath}?${qs}` : basePath;
    },
    [basePath, searchParams],
  );

  function changeSort(value: SortOption) {
    router.push(buildUrl({ sort: value === "newest" ? null : value }), {
      scroll: false,
    });
  }

  return (
    <>
      <section className="paper-grain min-h-screen bg-cream px-5 pb-24 pt-[128px] md:px-6 md:pt-36">
        <div className="mx-auto max-w-7xl">
          <header className="border-b border-cocoa/12 pb-9">
            <p className="text-sm font-bold uppercase tracking-[0.24em] text-cocoa">
              {eyebrow}
            </p>
            <h1 className="mt-4 font-display text-[44px] leading-[1.05] text-maroon md:text-6xl">
              {title}
            </h1>
            {intro ? (
              <p className="mt-4 max-w-xl text-base leading-7 text-charcoal/65">
                {intro}
              </p>
            ) : null}
          </header>

          {/* Toolbar — count + filter + sort. Scrolls normally with the page
              (not sticky/pinned) — deliberately not touching the site-wide
              header's own fixed positioning, which is a separate component. */}
          <div className="-mx-5 mt-6 flex items-center justify-between gap-3 border-b border-cocoa/10 bg-cream/85 px-5 py-3.5 backdrop-blur-xl md:-mx-6 md:px-6">
            <p className="text-sm text-charcoal/65">
              {total} {total === 1 ? "product" : "products"}
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileFiltersOpen(true)}
                className="inline-flex min-h-11 items-center gap-2 px-1 text-[11px] font-medium uppercase tracking-[0.18em] text-cocoa lg:hidden"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
                Filters
              </button>
              <SortDropdown value={currentSort} onChange={changeSort} />
            </div>
          </div>

          <div className="mt-10 grid gap-10 lg:grid-cols-[230px_1fr] lg:gap-14">
            {/* Sidebar (desktop) */}
            <aside className="hidden lg:block">
              <FilterPanel
                categories={categories}
                activeCategorySlug={activeCategorySlug}
              />
            </aside>

            {/* Grid */}
            <div>
              {products.length > 0 ? (
                <div className="grid gap-x-5 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
                  {products.map((p) => (
                    <ProductCard
                      key={p.id}
                      product={p}
                      wished={!!p.defaultVariantId && wished.has(p.defaultVariantId)}
                      onToggleWish={
                        p.defaultVariantId
                          ? () => toggleWish(p.defaultVariantId!)
                          : undefined
                      }
                    />
                  ))}
                </div>
              ) : (
                <EmptyState basePath={basePath} />
              )}

              {totalPages > 1 ? (
                <Pagination
                  page={page}
                  totalPages={totalPages}
                  buildUrl={(p) => buildUrl({ page: p === 1 ? null : String(p) })}
                />
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {/* Mobile filter sheet — deliberately a sibling of the .paper-grain
          section above, not a descendant. .paper-grain sets `isolation:
          isolate` (so its own grain-texture pseudo-element stays contained),
          which creates a new stacking context — a fixed-position child
          inside it can never paint above the site header/marquee (in a
          separate top-level stacking context) regardless of z-index math,
          since z-index only compares within the same stacking context.
          Confirmed live: with the sheet nested inside the section, the
          header rendered on top of the sheet's own close button and
          swallowed taps meant for it. */}
      <MobileFilterSheet
        open={mobileFiltersOpen}
        onClose={() => setMobileFiltersOpen(false)}
        categories={categories}
        activeCategorySlug={activeCategorySlug}
      />
    </>
  );
}

// ── Pieces ───────────────────────────────────────────────────────────────────

function SortDropdown({
  value,
  onChange,
}: {
  value: SortOption;
  onChange: (next: SortOption) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-cocoa">
      <span className="hidden sm:inline">Sort</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as SortOption)}
        className="rounded-full border border-cocoa/22 bg-cream px-3 py-1.5 text-base uppercase tracking-[0.16em] text-charcoal/85 outline-none transition duration-500 focus:border-cocoa sm:text-[11px]"
      >
        {(Object.keys(SORT_LABELS) as SortOption[]).map((k) => (
          <option key={k} value={k}>
            {SORT_LABELS[k]}
          </option>
        ))}
      </select>
    </label>
  );
}

function FilterPanel({
  categories,
  activeCategorySlug,
  onNavigate,
}: {
  categories: PlpCategory[];
  activeCategorySlug: string | null;
  onNavigate?: () => void;
}) {
  return (
    <div className="space-y-9">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-charcoal/55">
          Shop by
        </p>
        <nav className="mt-4 flex flex-col gap-2.5">
          <CatLink
            href="/shop"
            label="All pieces"
            active={activeCategorySlug === null}
            onClick={onNavigate}
          />
          {categories.map((c) => (
            <CatLink
              key={c.slug}
              href={`/shop/${c.slug}`}
              label={c.name}
              active={activeCategorySlug === c.slug}
              onClick={onNavigate}
            />
          ))}
        </nav>
      </div>
    </div>
  );
}

function CatLink({
  href,
  label,
  active,
  onClick,
}: {
  href: string;
  label: string;
  active: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`block w-fit text-sm transition duration-500 ${
        active
          ? "font-medium text-maroon"
          : "text-charcoal/72 hover:text-cocoa"
      }`}
    >
      {label}
    </Link>
  );
}

function MobileFilterSheet({
  open,
  onClose,
  categories,
  activeCategorySlug,
}: {
  open: boolean;
  onClose: () => void;
  categories: PlpCategory[];
  activeCategorySlug: string | null;
}) {
  useModalLock(open, onClose);

  return (
    <div
      className={`fixed inset-0 z-[60] transition duration-500 lg:hidden ${
        open ? "pointer-events-auto" : "pointer-events-none"
      }`}
      aria-hidden={!open}
      inert={!open}
    >
      {/* Scrim */}
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-charcoal/40 backdrop-blur-sm transition-opacity duration-500 ${
          open ? "opacity-100" : "opacity-0"
        }`}
      />
      {/* Panel */}
      <div
        className={`absolute inset-y-0 right-0 flex w-[88%] max-w-sm flex-col bg-cream pr-[env(safe-area-inset-right)] shadow-[-12px_0_40px_rgba(43,38,35,0.16)] transition-transform duration-500 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-cocoa/12 px-6 py-5">
          <h2 className="font-display text-2xl text-maroon">
            Filters
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close filters"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-cocoa hover:bg-cocoa/10"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div
          className="flex-1 overflow-y-auto px-6 py-7"
          style={{ paddingBottom: "calc(1.75rem + env(safe-area-inset-bottom))" }}
        >
          <FilterPanel
            categories={categories}
            activeCategorySlug={activeCategorySlug}
            onNavigate={onClose}
          />
        </div>
      </div>
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  buildUrl,
}: {
  page: number;
  totalPages: number;
  buildUrl: (page: number) => string;
}) {
  // Compact page-number list with ellipses for long ranges.
  const pages: (number | "…")[] = [];
  const push = (v: number | "…") => {
    if (pages[pages.length - 1] !== v) pages.push(v);
  };
  push(1);
  for (let i = page - 1; i <= page + 1; i++) {
    if (i > 1 && i < totalPages) {
      if (i > 2 && pages[pages.length - 1] !== i - 1) push("…");
      push(i);
    }
  }
  if (totalPages > 1) {
    if (page + 1 < totalPages - 1) push("…");
    push(totalPages);
  }

  const prevDisabled = page <= 1;
  const nextDisabled = page >= totalPages;

  return (
    <nav
      aria-label="Pagination"
      className="mt-16 flex items-center justify-start gap-2 overflow-x-auto px-1 [-ms-overflow-style:none] [scrollbar-width:none] sm:justify-center [&::-webkit-scrollbar]:hidden"
    >
      <PgLink
        href={buildUrl(page - 1)}
        disabled={prevDisabled}
        ariaLabel="Previous page"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      </PgLink>
      {pages.map((p, i) =>
        p === "…" ? (
          <span
            key={`gap-${i}`}
            className="px-2 text-sm text-charcoal/45"
            aria-hidden="true"
          >
            …
          </span>
        ) : (
          <PgLink
            key={p}
            href={buildUrl(p)}
            disabled={false}
            active={p === page}
            ariaLabel={`Page ${p}`}
          >
            <span className="tabular-nums">{p}</span>
          </PgLink>
        ),
      )}
      <PgLink
        href={buildUrl(page + 1)}
        disabled={nextDisabled}
        ariaLabel="Next page"
      >
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </PgLink>
    </nav>
  );
}

function PgLink({
  href,
  disabled,
  active,
  ariaLabel,
  children,
}: {
  href: string;
  disabled: boolean;
  active?: boolean;
  ariaLabel: string;
  children: React.ReactNode;
}) {
  const className = `inline-flex h-10 min-w-10 items-center justify-center rounded-full px-3 text-sm transition duration-500 ${
    active
      ? "bg-maroon text-cream"
      : "border border-cocoa/22 text-charcoal/75 hover:border-cocoa hover:text-cocoa"
  } ${disabled ? "pointer-events-none opacity-40" : ""}`;
  if (disabled) {
    return (
      <span aria-disabled="true" aria-label={ariaLabel} className={className}>
        {children}
      </span>
    );
  }
  return (
    <Link href={href} aria-label={ariaLabel} className={className}>
      {children}
    </Link>
  );
}

function EmptyState({ basePath }: { basePath: string }) {
  const isFiltered = basePath !== "/shop";
  return (
    <div className="flex flex-col items-center px-4 py-20 text-center">
      <h2 className="font-display text-[34px] leading-[1.1] text-maroon md:text-5xl">
        Nothing here yet
      </h2>
      <p className="mt-4 max-w-sm text-base leading-7 text-charcoal/60">
        {isFiltered
          ? "This corner of the wardrobe is still being prepared. Browse the full collection while it arrives."
          : "The first pieces are being prepared with care. Come back soon."}
      </p>
      {isFiltered ? (
        <Link
          href="/shop"
          className="mt-8 inline-flex items-center justify-center border border-cocoa/24 bg-cream px-7 py-4 text-[11px] font-bold tracking-[0.24em] text-cocoa shadow-[0_14px_34px_rgba(140,106,90,0.14)] transition duration-1000 hover:bg-cocoa/12"
        >
          Browse all pieces
        </Link>
      ) : null}
    </div>
  );
}
