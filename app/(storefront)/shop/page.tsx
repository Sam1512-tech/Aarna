import type { Metadata } from "next";
import { PlpView, type SortOption } from "@/components/storefront/plp-view";
import { toProductCardData } from "@/components/storefront/product-card";
import {
  getCategories,
  getDefaultVariantsForProducts,
  getProducts,
} from "@/lib/actions/products";
import { safeDbRead, SAFE_DB_READ_TIMEOUT_MS } from "@/lib/db/safe-query";

export const metadata: Metadata = {
  title: "Shop",
  description:
    "Browse the full Aarna wardrobe — slow-made pieces for everyday rituals, quiet gatherings, travel, and layering.",
};

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

export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    sort?: string;
    min?: string;
    max?: string;
  }>;
}) {
  const params = await searchParams;
  const page = parseInt1(params.page, 1);
  const sort = parseSort(params.sort);
  const minPrice = params.min ? Number.parseInt(params.min, 10) : undefined;
  const maxPrice = params.max ? Number.parseInt(params.max, 10) : undefined;

  const [categories, list] = await Promise.all([
    safeDbRead(getCategories(), {
      timeoutMs: SAFE_DB_READ_TIMEOUT_MS,
      fallback: [],
      label: "shop page categories",
    }),
    safeDbRead(
      getProducts({
        page,
        pageSize: PAGE_SIZE,
        sort,
        minPrice: Number.isFinite(minPrice) ? minPrice : undefined,
        maxPrice: Number.isFinite(maxPrice) ? maxPrice : undefined,
      }),
      {
        timeoutMs: SAFE_DB_READ_TIMEOUT_MS,
        fallback: { items: [], total: 0, page, pageSize: PAGE_SIZE },
        label: "shop page products",
      },
    ),
  ]);
  const defaultVariants = await safeDbRead(
    getDefaultVariantsForProducts(list.items.map((p) => p.id)),
    {
      timeoutMs: SAFE_DB_READ_TIMEOUT_MS,
      fallback: new Map(),
      label: "shop page default variants",
    },
  );

  return (
    <PlpView
      eyebrow="the wardrobe"
      title="Every piece, made slowly."
      intro="A small, considered collection. Browse all current pieces by sort and refine as you go."
      products={list.items.map((p) =>
        toProductCardData(p, undefined, defaultVariants.get(p.id) ?? null),
      )}
      total={list.total}
      page={list.page}
      pageSize={list.pageSize}
      basePath="/shop"
      categories={categories.map((c) => ({ name: c.name, slug: c.slug }))}
      activeCategorySlug={null}
    />
  );
}
