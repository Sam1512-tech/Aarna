import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PlpView, type SortOption } from "@/components/storefront/plp-view";
import { toProductCardData } from "@/components/storefront/product-card";
import { getCategories, getProducts } from "@/lib/actions/products";
import { categoryMetadata } from "@/lib/seo/metadata";

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
    const categories = await getCategories();
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

  const categories = await getCategories();
  const category = categories.find((c) => c.slug === slug);
  if (!category) notFound();

  const list = await getProducts({
    category: slug,
    page,
    pageSize: PAGE_SIZE,
    sort,
    minPrice: Number.isFinite(minPrice) ? minPrice : undefined,
    maxPrice: Number.isFinite(maxPrice) ? maxPrice : undefined,
  });

  return (
    <PlpView
      eyebrow="the wardrobe"
      title={category.name}
      products={list.items.map((p) => toProductCardData(p))}
      total={list.total}
      page={list.page}
      pageSize={list.pageSize}
      basePath={`/shop/${slug}`}
      categories={categories.map((c) => ({ name: c.name, slug: c.slug }))}
      activeCategorySlug={slug}
    />
  );
}
