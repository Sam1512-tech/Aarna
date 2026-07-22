import Link from "next/link";
import type { Metadata } from "next";
import {
  AdminEmpty,
  AdminPageHeader,
  StatusPill,
  tableClasses,
} from "@/components/admin/admin-primitives";
import { DeleteButton } from "@/components/admin/delete-button";
import { ReorderButtons } from "@/components/admin/reorder-buttons";
import { deleteBanner, getAdminBanners, reorderBanners } from "@/lib/actions/admin/banners";

export const metadata: Metadata = { title: "Admin · banners" };

// Vercel functions default to UTC even in bom1 — pin every admin date to IST
// so timestamps match the client's phone clock.
function fmtDate(d: Date | string | null) {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  });
}

export default async function AdminBannersPage() {
  const banners = await getAdminBanners().catch(() => []);
  const t = tableClasses();

  return (
    <div>
      <AdminPageHeader
        eyebrow="Homepage"
        title="Banners"
        intro="Hero images and videos the homepage carousel rotates through."
        action={{ href: "/studio/banners/new", label: "add banner" }}
      />

      <div className="mt-6">
        {banners.length === 0 ? (
          <AdminEmpty
            title="No banners yet"
            description="Add a hero image or video to fill the homepage carousel."
            cta={{ href: "/studio/banners/new", label: "add your first banner" }}
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
                  <th className={t.th}></th>
                </tr>
              </thead>
              <tbody>
                {banners.map((b) => (
                  <tr key={b.id} className={t.tr}>
                    <td className={`${t.td} tabular-nums text-charcoal/60`}>
                      <div className="flex items-center gap-2">
                        <span>{b.sortOrder}</span>
                        <ReorderButtons
                          items={banners}
                          id={b.id}
                          action={reorderBanners}
                        />
                      </div>
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
                    <td className={t.td}>
                      <div className="flex items-center justify-end gap-3">
                        <Link
                          href={`/studio/banners/${b.id}`}
                          className="soft-link text-[11px] font-bold uppercase tracking-[0.16em] text-cocoa"
                        >
                          edit
                        </Link>
                        <DeleteButton
                          action={deleteBanner}
                          id={b.id}
                          label={`delete ${b.title ?? "banner"}`}
                          confirmMessage={`Delete "${b.title ?? "this banner"}"? This cannot be undone.`}
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
