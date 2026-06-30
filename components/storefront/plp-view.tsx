"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, SlidersHorizontal, X } from "lucide-react";
import { useCallback, useState } from "react";
import {
  ProductCard,
  type ProductCardData,
} from "@/components/storefront/product-card";

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
  newest: "newest",
  price_asc: "price · low to high",
  price_desc: "price · high to low",
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
    <section className="paper-grain min-h-screen bg-cream px-5 pb-24 pt-[128px] md:px-6 md:pt-36">
      <div className="mx-auto max-w-7xl">
        <header className="fade-rise border-b border-cocoa/12 pb-9">
          <p className="text-sm font-bold uppercase tracking-[0.24em] text-cocoa">
            {eyebrow}
          </p>
          <h1 className="mt-4 font-display text-[44px] lowercase leading-[1.05] text-maroon md:text-6xl">
            {title}
          </h1>
          {intro ? (
            <p className="mt-4 max-w-xl text-base leading-7 text-charcoal/65">
              {intro}
            </p>
          ) : null}
        </header>

        {/* Toolbar — count + filter + sort */}
        <div className="sticky top-[120px] z-20 -mx-5 mt-6 flex items-center justify-between gap-3 border-b border-cocoa/10 bg-cream/85 px-5 py-3.5 backdrop-blur-xl md:top-[100px] md:-mx-6 md:px-6">
          <p className="text-sm lowercase text-charcoal/65">
            {total} {total === 1 ? "piece" : "pieces"}
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileFiltersOpen(true)}
              className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-cocoa lg:hidden"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
              filters
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
          <div className="fade-rise">
            {products.length > 0 ? (
              <div className="grid gap-x-5 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
                {products.map((p, i) => (
                  <ProductCard key={p.id} product={p} staggerIndex={i} />
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

      {/* Mobile filter sheet */}
      <MobileFilterSheet
        open={mobileFiltersOpen}
        onClose={() => setMobileFiltersOpen(false)}
        categories={categories}
        activeCategorySlug={activeCategorySlug}
      />
    </section>
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
      <span className="hidden sm:inline">sort</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as SortOption)}
        className="rounded-full border border-cocoa/22 bg-cream px-3 py-1.5 text-[11px] uppercase tracking-[0.16em] text-charcoal/85 outline-none transition duration-500 focus:border-cocoa"
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
          shop by
        </p>
        <nav className="mt-4 flex flex-col gap-2.5">
          <CatLink
            href="/shop"
            label="all pieces"
            active={activeCategorySlug === null}
            onClick={onNavigate}
          />
          {categories.map((c) => (
            <CatLink
              key={c.slug}
              href={`/shop/${c.slug}`}
              label={c.name.toLowerCase()}
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
      className={`block w-fit text-sm lowercase transition duration-500 ${
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
  return (
    <div
      className={`fixed inset-0 z-[60] transition duration-500 lg:hidden ${
        open ? "pointer-events-auto" : "pointer-events-none"
      }`}
      aria-hidden={!open}
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
        className={`absolute inset-y-0 right-0 flex w-[88%] max-w-sm flex-col bg-cream shadow-[-12px_0_40px_rgba(43,38,35,0.16)] transition-transform duration-500 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-cocoa/12 px-6 py-5">
          <h2 className="font-display text-2xl lowercase text-maroon">
            filters
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
        <div className="flex-1 overflow-y-auto px-6 py-7">
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
      className="mt-16 flex items-center justify-center gap-2"
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
      <h2 className="font-display text-[34px] lowercase leading-[1.1] text-maroon md:text-5xl">
        nothing here yet
      </h2>
      <p className="mt-4 max-w-sm text-base leading-7 text-charcoal/60">
        {isFiltered
          ? "this corner of the wardrobe is still being prepared. browse the full collection while it arrives."
          : "the first pieces are being prepared with care. come back soon."}
      </p>
      {isFiltered ? (
        <Link
          href="/shop"
          className="mt-8 inline-flex items-center justify-center border border-cocoa/24 bg-cream px-7 py-4 text-[11px] font-bold lowercase tracking-[0.24em] text-cocoa shadow-[0_14px_34px_rgba(140,106,90,0.14)] transition duration-1000 hover:bg-cocoa/12"
        >
          browse all pieces
        </Link>
      ) : null}
    </div>
  );
}
