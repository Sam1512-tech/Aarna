import type { Metadata } from "next";
import { SearchView } from "@/components/storefront/search-view";
import { getCategories, getProducts } from "@/lib/actions/products";

export const metadata: Metadata = {
  title: "search",
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

  return (
    <SearchView
      categories={categories.map((c) => ({ name: c.name, slug: c.slug }))}
      products={productList.items.map((p) => ({
        id: p.id,
        title: p.title,
        slug: p.slug,
        basePrice: p.basePrice,
        fabric: p.fabric,
      }))}
      initialQuery={q ?? ""}
    />
  );
}
