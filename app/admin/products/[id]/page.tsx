import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/admin-primitives";
import { getAdminProductDetail } from "@/lib/actions/admin/products";
import { getCategories } from "@/lib/actions/products";
import { ProductEditView } from "./product-edit-view";

export const metadata: Metadata = { title: "admin · edit product" };

export default async function AdminProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [product, categories] = await Promise.all([
    getAdminProductDetail(id).catch(() => null),
    getCategories().catch(() => []),
  ]);
  if (!product) notFound();

  return (
    <div>
      <AdminPageHeader
        eyebrow="catalog · products"
        title={product.title}
        intro="Edit basics, add variants, upload images, and print hang tags."
      />
      <div className="mt-1">
        <Link
          href={`/product/${product.slug}`}
          target="_blank"
          rel="noreferrer"
          className="soft-link text-[11px] font-bold uppercase tracking-[0.18em] text-cocoa"
        >
          view on storefront →
        </Link>
      </div>
      <ProductEditView
        product={{
          id: product.id,
          title: product.title,
          slug: product.slug,
          description: product.description ?? "",
          fabric: product.fabric ?? "",
          washCare: product.washCare ?? "",
          basePrice: product.basePrice,
          mrp: product.mrp ?? null,
          categoryId: product.categoryId ?? null,
          status: product.status as "draft" | "active" | "archived",
          variants: product.variants.map((v) => ({
            id: v.id,
            size: v.size ?? "",
            color: v.color ?? "",
            sku: v.sku,
            price: v.price,
            stock: v.stock,
            weightGrams: v.weightGrams ?? null,
            isActive: v.isActive,
          })),
          images: product.images.map((img) => ({
            id: img.id,
            url: img.url,
            altText: img.altText ?? "",
            sortOrder: img.sortOrder,
          })),
        }}
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
      />
    </div>
  );
}
