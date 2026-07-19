import type { Metadata } from "next";
import { SearchView } from "@/components/storefront/search-view";
import {
  getCategories,
  getDefaultVariantsForProducts,
  getProducts,
} from "@/lib/actions/products";

export const metadata: Metadata = {
  title: "Search",
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const [categories, productList] = await Promise.all([
    getCategories(),
    getProducts({ pageSize: 60 }),
  ]);
  const defaultVariants = await getDefaultVariantsForProducts(
    productList.items.map((p) => p.id),
  );

  return (
    <SearchView
      categories={categories.map((c) => ({ name: c.name, slug: c.slug }))}
      products={productList.items.map((p) => ({
        id: p.id,
        title: p.title,
        slug: p.slug,
        basePrice: p.basePrice,
        fabric: p.fabric,
        defaultVariantId: defaultVariants.get(p.id) ?? null,
      }))}
      initialQuery={q ?? ""}
    />
  );
}
