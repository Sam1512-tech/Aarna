import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { AdminPageHeader } from "@/components/admin/admin-primitives";
import { getAdminCategory } from "@/lib/actions/admin/categories";
import { CategoryEditView } from "./category-edit-view";

export const metadata: Metadata = { title: "Admin · edit category" };

export default async function AdminEditCategoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const category = await getAdminCategory(id);
  if (!category) notFound();

  return (
    <div>
      <AdminPageHeader
        eyebrow="Catalog"
        title={category.name}
        intro="Renaming or re-slugging updates the nav and homepage immediately."
      />
      <CategoryEditView category={category} />
    </div>
  );
}
