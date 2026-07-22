import Link from "next/link";
import type { Metadata } from "next";
import {
  AdminEmpty,
  AdminPageHeader,
  StatusPill,
  tableClasses,
} from "@/components/admin/admin-primitives";
import { DeleteButton } from "@/components/admin/delete-button";
import { HomepageFeatureToggle } from "@/components/admin/homepage-feature-toggle";
import {
  deleteCollection,
  getAdminCollections,
} from "@/lib/actions/admin/collections";

export const metadata: Metadata = { title: "admin · collections" };

export default async function AdminCollectionsPage() {
  const collections = await getAdminCollections().catch(() => []);
  const t = tableClasses();

  return (
    <div>
      <AdminPageHeader
        eyebrow="catalog"
        title="collections"
        intro="Curated groupings of products — like 'slow essentials' or seasonal edits."
        action={{
          href: "/studio/collections/new",
          label: "add collection",
        }}
      />

      <div className="mt-6">
        {collections.length === 0 ? (
          <AdminEmpty
            title="no collections yet"
            description="collections let you group pieces together for the storefront (e.g. 'slow essentials')."
            cta={{ href: "/studio/collections/new", label: "add your first collection" }}
          />
        ) : (
          <div className={t.wrapper}>
            <table className={t.table}>
              <thead className={t.thead}>
                <tr>
                  <th className={t.th}>#</th>
                  <th className={t.th}>name</th>
                  <th className={t.th}>slug</th>
                  <th className={t.th}>products</th>
                  <th className={t.th}>status</th>
                  <th className={t.th}>homepage</th>
                  <th className={t.th}></th>
                </tr>
              </thead>
              <tbody>
                {collections.map((c) => (
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
                    <td className={`${t.td} tabular-nums`}>
                      {c.productCount ?? "—"}
                    </td>
                    <td className={t.td}>
                      <StatusPill
                        label={c.isActive ? "active" : "inactive"}
                        tone={c.isActive ? "ok" : "muted"}
                      />
                    </td>
                    <td className={t.td}>
                      <HomepageFeatureToggle
                        id={c.id}
                        name={c.name}
                        featured={c.isHomepageFeature}
                      />
                    </td>
                    <td className={t.td}>
                      <div className="flex items-center justify-end gap-3">
                        <Link
                          href={`/studio/collections/${c.id}`}
                          className="soft-link text-[11px] font-bold uppercase tracking-[0.16em] text-cocoa"
                        >
                          edit
                        </Link>
                        <DeleteButton
                          action={deleteCollection}
                          id={c.id}
                          label={`delete ${c.name}`}
                          confirmMessage={`Delete "${c.name}"? This cannot be undone.`}
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
