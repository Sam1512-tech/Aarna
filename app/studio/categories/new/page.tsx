import type { Metadata } from "next";
import { AdminPageHeader } from "@/components/admin/admin-primitives";
import { NewCategoryForm } from "./new-category-form";

export const metadata: Metadata = { title: "Admin · add category" };

export default function AdminNewCategoryPage() {
  return (
    <div>
      <AdminPageHeader
        eyebrow="Catalog"
        title="Add category"
        intro="Stays off the storefront until you tick Active — then it appears in the nav and homepage with no code changes needed."
      />
      <NewCategoryForm />
    </div>
  );
}
