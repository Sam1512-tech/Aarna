import type { Metadata } from "next";
import {
  AdminEmpty,
  AdminPageHeader,
  StatusPill,
  tableClasses,
} from "@/components/admin/admin-primitives";
import { getAdminBanners } from "@/lib/actions/admin/banners";

export const metadata: Metadata = { title: "admin · banners" };

function fmtDate(d: Date | string | null) {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function AdminBannersPage() {
  const banners = await getAdminBanners().catch(() => []);
  const t = tableClasses();

  return (
    <div>
      <AdminPageHeader
        eyebrow="homepage"
        title="banners"
        intro="Hero images and videos the homepage carousel rotates through."
        action={{ href: "/admin/banners/new", label: "add banner" }}
      />

      <div className="mt-6">
        {banners.length === 0 ? (
          <AdminEmpty
            title="no banners yet"
            description="add a hero image or video to fill the homepage carousel."
            cta={{ href: "/admin/banners/new", label: "add your first banner" }}
          />
        ) : (
          <div className={t.wrapper}>
            <table className={t.table}>
              <thead className={t.thead}>
                <tr>
                  <th className={t.th}>#</th>
                  <th className={t.th}>title</th>
                  <th className={t.th}>image</th>
                  <th className={t.th}>schedule</th>
                  <th className={t.th}>status</th>
                </tr>
              </thead>
              <tbody>
                {banners.map((b) => (
                  <tr key={b.id} className={t.tr}>
                    <td className={`${t.td} tabular-nums text-charcoal/60`}>
                      {b.sortOrder}
                    </td>
                    <td className={t.td}>
                      <p className="text-charcoal">{b.title ?? "—"}</p>
                      {b.subtitle ? (
                        <p className="mt-0.5 text-xs text-charcoal/50">
                          {b.subtitle}
                        </p>
                      ) : null}
                    </td>
                    <td className={`${t.td} truncate font-mono text-xs text-charcoal/60`}>
                      {b.imageUrl.split("/").slice(-1)[0]}
                    </td>
                    <td className={t.td}>
                      {b.startsAt || b.endsAt
                        ? `${fmtDate(b.startsAt)} → ${fmtDate(b.endsAt)}`
                        : "always"}
                    </td>
                    <td className={t.td}>
                      <StatusPill
                        label={b.isActive ? "active" : "inactive"}
                        tone={b.isActive ? "ok" : "muted"}
                      />
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
