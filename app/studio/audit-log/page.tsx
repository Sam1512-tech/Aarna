import type { Metadata } from "next";
import {
  AdminEmpty,
  AdminPageHeader,
  tableClasses,
} from "@/components/admin/admin-primitives";
import { AutoSubmitForm } from "@/components/admin/auto-submit-form";
import {
  getAdminAuditLog,
  getAuditLogEntityTypes,
} from "@/lib/actions/admin/audit-log";

export const metadata: Metadata = { title: "Admin · audit log" };

// Admin dates render in IST regardless of the server clock — see the same
// note in app/studio/orders/page.tsx.
function fmtDate(d: Date | string) {
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

function describeMetadata(metadata: unknown): string {
  if (!metadata || typeof metadata !== "object") return "—";
  const entries = Object.entries(metadata as Record<string, unknown>).filter(
    ([, v]) => v !== undefined,
  );
  if (entries.length === 0) return "—";
  return entries
    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join(" · ");
}

export default async function AdminAuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ entityType?: string; page?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const entityType = params.entityType?.trim() || undefined;

  const [result, entityTypes] = await Promise.all([
    getAdminAuditLog({ entityType, page, pageSize: 50 }).catch(() => ({
      items: [],
      total: 0,
      page: 1,
      pageSize: 50,
    })),
    getAuditLogEntityTypes().catch(() => []),
  ]);

  const t = tableClasses();
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));

  return (
    <div>
      <AdminPageHeader
        eyebrow="Business"
        title="Audit log"
        intro="Every product, order, coupon, and content change made from this admin panel — who did it and when."
      />

      <AutoSubmitForm className="mt-6">
        <label className="block max-w-xs">
          <span className="block text-[11px] font-medium uppercase tracking-[0.16em] text-charcoal/72">
            entity type
          </span>
          <select
            name="entityType"
            defaultValue={entityType ?? ""}
            className="mt-1.5 block rounded-xl border border-cocoa/20 bg-cream px-4 py-2.5 text-base text-charcoal outline-none transition duration-500 focus:border-cocoa sm:text-sm"
          >
            <option value="">all</option>
            {entityTypes.map((et) => (
              <option key={et} value={et}>
                {et.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
      </AutoSubmitForm>

      <div className="mt-6">
        {result.items.length === 0 ? (
          <AdminEmpty
            title="No activity yet"
            description="Admin changes will show up here as they happen."
          />
        ) : (
          <div className={t.wrapper}>
            <table className={t.table}>
              <thead className={t.thead}>
                <tr>
                  <th className={t.th}>when</th>
                  <th className={t.th}>admin</th>
                  <th className={t.th}>action</th>
                  <th className={t.th}>entity</th>
                  <th className={t.th}>details</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((row) => (
                  <tr key={row.id} className={t.tr}>
                    <td className={t.td}>{fmtDate(row.createdAt)}</td>
                    <td className={t.td}>{row.adminEmail}</td>
                    <td className={t.td}>
                      <p className="font-medium text-charcoal">{row.action}</p>
                    </td>
                    <td className={t.td}>
                      <p className="text-charcoal">{row.entityType.replaceAll("_", " ")}</p>
                      {row.entityId ? (
                        <p className="text-xs text-charcoal/50">{row.entityId}</p>
                      ) : null}
                    </td>
                    <td className={`${t.td} max-w-md`}>
                      <p className="text-xs text-charcoal/70">
                        {describeMetadata(row.metadata)}
                      </p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {totalPages > 1 ? (
        <p className="mt-6 text-center text-xs text-charcoal/50">
          Page {result.page} of {totalPages} · {result.total} total
        </p>
      ) : null}
    </div>
  );
}
