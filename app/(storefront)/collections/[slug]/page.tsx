import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PlpView, type SortOption } from "@/components/storefront/plp-view";
import { toProductCardData } from "@/components/storefront/product-card";
import {
  getCategories,
  getCollectionBySlug,
  getDefaultVariantsForProducts,
  getProducts,
} from "@/lib/actions/products";
import { collectionMetadata } from "@/lib/seo/metadata";

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
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  try {
    const collection = await getCollectionBySlug(slug);
    if (!collection) return { title: "Collection not found" };
    return collectionMetadata(collection);
  } catch {
    return { title: "Collections" };
  }
}

export default async function CollectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    page?: string;
    sort?: string;
    min?: string;
    max?: string;
  }>;
}) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const page = parseInt1(sp.page, 1);
  const sort = parseSort(sp.sort);
  const minPrice = sp.min ? Number.parseInt(sp.min, 10) : undefined;
  const maxPrice = sp.max ? Number.parseInt(sp.max, 10) : undefined;

  const [collection, categories] = await Promise.all([
    getCollectionBySlug(slug),
    getCategories(),
  ]);
  if (!collection) notFound();

  const list = await getProducts({
    collection: slug,
    page,
    pageSize: PAGE_SIZE,
    sort,
    minPrice: Number.isFinite(minPrice) ? minPrice : undefined,
    maxPrice: Number.isFinite(maxPrice) ? maxPrice : undefined,
  });
  const defaultVariants = await getDefaultVariantsForProducts(
    list.items.map((p) => p.id),
  );

  return (
    <PlpView
      eyebrow="the collection"
      title={collection.name}
      intro={collection.description ?? undefined}
      products={list.items.map((p) =>
        toProductCardData(p, undefined, defaultVariants.get(p.id) ?? null),
      )}
      total={list.total}
      page={list.page}
      pageSize={list.pageSize}
      basePath={`/collections/${slug}`}
      categories={categories.map((c) => ({ name: c.name, slug: c.slug }))}
    />
  );
}
