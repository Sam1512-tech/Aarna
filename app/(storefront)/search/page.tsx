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
  const categoryIdToSlug = new Map(categories.map((c) => [c.id, c.slug]));

  return (
    <SearchView
      categories={categories.map((c) => ({
        name: c.name,
        slug: c.slug,
        imageUrl: c.imageUrl,
      }))}
      products={productList.items.map((p) => ({
        id: p.id,
        title: p.title,
        slug: p.slug,
        basePrice: p.basePrice,
        mrp: p.mrp,
        image: p.image,
        fabric: p.fabric,
        defaultVariantId: defaultVariants.get(p.id) ?? null,
        categorySlug: p.categoryId
          ? (categoryIdToSlug.get(p.categoryId) ?? null)
          : null,
      }))}
      initialQuery={q ?? ""}
    />
  );
}
