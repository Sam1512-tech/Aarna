import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PlpView, type SortOption } from "@/components/storefront/plp-view";
import { toProductCardData } from "@/components/storefront/product-card";
import {
  getCategories,
  getDefaultVariantsForProducts,
  getProducts,
} from "@/lib/actions/products";
import { safeDbRead, SAFE_DB_READ_TIMEOUT_MS } from "@/lib/db/safe-query";
import { categoryMetadata } from "@/lib/seo/metadata";
import type { Category } from "@/lib/types";

// See the identical sentinel in product/[slug]/page.tsx — a timed-out
// category lookup must not be treated as "category doesn't exist" (notFound),
// or a transient DB hang would falsely 404 a real, live category page.
const TIMED_OUT = Symbol("category-lookup-timed-out");

const PAGE_SIZE = 24;
const VALID_SORTS: SortOption[] = ["newest", "price_asc", "price_desc"];

function parseSort(raw: string | undefined): SortOption {
  return raw && (VALID_SORTS as string[]).includes(raw)
    ? (raw as SortOption)
    : "newest";
}
function parseInt1(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string }>;
}): Promise<Metadata> {
  const { category: slug } = await params;
  try {
    const categories = await safeDbRead<Category[] | typeof TIMED_OUT>(
      getCategories(),
      {
        timeoutMs: SAFE_DB_READ_TIMEOUT_MS,
        fallback: TIMED_OUT,
        label: `category metadata lookup (${slug})`,
      },
    );
    if (categories === TIMED_OUT) return { title: "Shop" };
    const cat = categories.find((c) => c.slug === slug);
    if (!cat) return { title: "Category not found" };
    return categoryMetadata(cat);
  } catch {
    return { title: "Shop" };
  }
}

export default async function ShopCategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ category: string }>;
  searchParams: Promise<{
    page?: string;
    sort?: string;
    min?: string;
    max?: string;
  }>;
}) {
  const [{ category: slug }, sp] = await Promise.all([params, searchParams]);
  const page = parseInt1(sp.page, 1);
  const sort = parseSort(sp.sort);
  const minPrice = sp.min ? Number.parseInt(sp.min, 10) : undefined;
  const maxPrice = sp.max ? Number.parseInt(sp.max, 10) : undefined;

  const categories = await safeDbRead<Category[] | typeof TIMED_OUT>(
    getCategories(),
    {
      timeoutMs: SAFE_DB_READ_TIMEOUT_MS,
      fallback: TIMED_OUT,
      label: `category page lookup (${slug})`,
    },
  );
  if (categories === TIMED_OUT) {
    // Bounded real error (renders the error boundary, HTTP 500) — not
    // notFound(), which would falsely tell a crawler this category is gone.
    throw new Error(`Category lookup timed out for slug "${slug}"`);
  }
  const category = categories.find((c) => c.slug === slug);
  if (!category) notFound();

  const list = await safeDbRead(
    getProducts({
      category: slug,
      page,
      pageSize: PAGE_SIZE,
      sort,
      minPrice: Number.isFinite(minPrice) ? minPrice : undefined,
      maxPrice: Number.isFinite(maxPrice) ? maxPrice : undefined,
    }),
    {
      timeoutMs: SAFE_DB_READ_TIMEOUT_MS,
      fallback: { items: [], total: 0, page, pageSize: PAGE_SIZE },
      label: `category products (${slug})`,
    },
  );
  const defaultVariants = await safeDbRead(
    getDefaultVariantsForProducts(list.items.map((p) => p.id)),
    {
      timeoutMs: SAFE_DB_READ_TIMEOUT_MS,
      fallback: new Map(),
      label: `category default variants (${slug})`,
    },
  );

  return (
    <PlpView
      eyebrow="the wardrobe"
      title={category.name}
      products={list.items.map((p) =>
        toProductCardData(p, undefined, defaultVariants.get(p.id) ?? null),
      )}
      total={list.total}
      page={list.page}
      pageSize={list.pageSize}
      basePath={`/shop/${slug}`}
      categories={categories.map((c) => ({ name: c.name, slug: c.slug }))}
      activeCategorySlug={slug}
    />
  );
}
