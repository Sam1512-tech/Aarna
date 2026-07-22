import type { Metadata } from "next";
import { AdminPageHeader } from "@/components/admin/admin-primitives";
import { NewCategoryForm } from "./new-category-form";

export const metadata: Metadata = { title: "admin · add category" };

export default function AdminNewCategoryPage() {
  return (
    <div>
      <AdminPageHeader
        eyebrow="catalog"
        title="add category"
        intro="Appears in the nav and homepage the moment it's created — no code changes needed."
      />
      <NewCategoryForm />
    </div>
  );
}
