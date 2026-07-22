import type { Metadata } from "next";
import { AdminPageHeader } from "@/components/admin/admin-primitives";
import { getCategories } from "@/lib/actions/products";
import { NewProductForm } from "./new-product-form";

export const metadata: Metadata = { title: "Admin · add product" };

export default async function AdminNewProductPage() {
  const categories = await getCategories().catch(() => []);
  return (
    <div>
      <AdminPageHeader
        eyebrow="Catalog · products"
        title="Add product"
        intro="Fill in the essentials — MRP, fabric, and care are legally required on the hang tag. Add variants and images after saving."
      />
      <NewProductForm
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
      />
    </div>
  );
}
