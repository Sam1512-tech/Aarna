import Link from "next/link";
import type { Metadata } from "next";
import {
  AdminEmpty,
  AdminPageHeader,
  tableClasses,
} from "@/components/admin/admin-primitives";
import { DeleteButton } from "@/components/admin/delete-button";
import { deleteCategory, getAdminCategories } from "@/lib/actions/admin/categories";

export const metadata: Metadata = { title: "admin · categories" };

export default async function AdminCategoriesPage() {
  const categories = await getAdminCategories().catch(() => []);
  const t = tableClasses();

  return (
    <div>
      <AdminPageHeader
        eyebrow="catalog"
        title="categories"
        intro="The wardrobe paths customers browse by — shown in the nav and homepage exactly in this order."
        action={{ href: "/admin/categories/new", label: "add category" }}
      />

      <div className="mt-6">
        {categories.length === 0 ? (
          <AdminEmpty
            title="no categories yet"
            description="add at least one category so products have somewhere to live on the storefront."
            cta={{ href: "/admin/categories/new", label: "add your first category" }}
          />
        ) : (
          <div className={t.wrapper}>
            <table className={t.table}>
              <thead className={t.thead}>
                <tr>
                  <th className={t.th}>#</th>
                  <th className={t.th}>name</th>
                  <th className={t.th}>slug</th>
                  <th className={t.th}></th>
                </tr>
              </thead>
              <tbody>
                {categories.map((c) => (
                  <tr key={c.id} className={t.tr}>
                    <td className={`${t.td} tabular-nums text-charcoal/60`}>
                      {c.sortOrder}
                    </td>
                    <td className={t.td}>
                      <p className="text-charcoal">{c.name}</p>
                    </td>
                    <td className={`${t.td} font-mono text-xs text-charcoal/60`}>
                      /{c.slug}
                    </td>
                    <td className={t.td}>
                      <div className="flex items-center justify-end gap-3">
                        <Link
                          href={`/admin/categories/${c.id}`}
                          className="soft-link text-[11px] font-bold uppercase tracking-[0.16em] text-cocoa"
                        >
                          edit
                        </Link>
                        <DeleteButton
                          action={deleteCategory}
                          id={c.id}
                          label={`delete ${c.name}`}
                          confirmMessage={`Delete "${c.name}"? Products in this category must be reassigned first — this cannot be undone.`}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
