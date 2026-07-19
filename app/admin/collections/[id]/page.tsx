import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { AdminPageHeader } from "@/components/admin/admin-primitives";
import { getAdminCollectionDetail } from "@/lib/actions/admin/collections";
import { CollectionEditView } from "./collection-edit-view";

export const metadata: Metadata = { title: "admin · edit collection" };

export default async function AdminEditCollectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const collection = await getAdminCollectionDetail(id);
  if (!collection) notFound();

  return (
    <div>
      <AdminPageHeader
        eyebrow="catalog · collections"
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
      />
    </div>
  );
}
