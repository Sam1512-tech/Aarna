import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { AdminPageHeader } from "@/components/admin/admin-primitives";
import { getAdminCollectionDetail } from "@/lib/actions/admin/collections";
import { getAdminProducts } from "@/lib/actions/admin/products";
import { CollectionEditView } from "./collection-edit-view";

export const metadata: Metadata = { title: "Admin · edit collection" };

export default async function AdminEditCollectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [collection, productList] = await Promise.all([
    getAdminCollectionDetail(id),
    getAdminProducts({ pageSize: 100 }),
  ]);
  if (!collection) notFound();

  return (
    <div>
      <AdminPageHeader
        eyebrow="Catalog · collections"
        title={collection.name}
        intro="Curated grouping of products shown on the storefront."
      />
      <CollectionEditView
        collection={{
          id: collection.id,
          name: collection.name,
          slug: collection.slug,
          description: collection.description ?? "",
          heroImageUrl: collection.heroImageUrl ?? "",
          sortOrder: collection.sortOrder,
          isActive: collection.isActive,
        }}
        members={collection.products}
        allProducts={productList.items.map((p) => ({
          id: p.id,
          title: p.title,
          basePrice: p.basePrice,
          status: p.status,
        }))}
      />
    </div>
  );
}
