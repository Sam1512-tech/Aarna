import type { Metadata } from "next";
import {
  AdminEmpty,
  AdminPageHeader,
  StatusPill,
  tableClasses,
} from "@/components/admin/admin-primitives";
import { getAdminReturns } from "@/lib/actions/admin/returns";
import { formatINR } from "@/lib/utils";

export const metadata: Metadata = { title: "admin · returns" };

const STATUSES = [
  "requested",
  "approved",
  "picked",
  "received",
  "refunded",
  "rejected",
] as const;
type ReturnStatus = (typeof STATUSES)[number];

function fmtDate(d: Date | string | null) {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function AdminReturnsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const status = (STATUSES as readonly string[]).includes(params.status ?? "")
    ? (params.status as ReturnStatus)
    : undefined;

  const result = await getAdminReturns({ status, page, pageSize: 30 }).catch(
    () => ({ items: [], total: 0, page: 1, pageSize: 30 }),
  );

  const t = tableClasses();
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));

  return (
    <div>
      <AdminPageHeader
        eyebrow="commerce"
        title="returns"
        intro="Return requests raised by customers within the 14-day window."
      />

      <form method="get" className="mt-6 flex flex-wrap items-end gap-3">
        <label>
          <span className="block text-[11px] font-medium uppercase tracking-[0.16em] text-charcoal/55">
            status
          </span>
          <select
            name="status"
            defaultValue={status ?? ""}
            className="mt-1.5 block rounded-xl border border-cocoa/20 bg-cream px-4 py-2.5 text-sm text-charcoal outline-none transition duration-500 focus:border-cocoa"
          >
            <option value="">all</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="rounded-full bg-maroon px-4 py-2 text-[11px] font-medium uppercase tracking-[0.16em] text-cream transition duration-500 hover:bg-maroon/90"
        >
          filter
        </button>
      </form>

      <div className="mt-6">
        {result.items.length === 0 ? (
          <AdminEmpty
            title="no returns match"
            description="the return queue is clear for this filter."
          />
        ) : (
          <div className={t.wrapper}>
            <table className={t.table}>
              <thead className={t.thead}>
                <tr>
                  <th className={t.th}>order</th>
                  <th className={t.th}>item</th>
                  <th className={t.th}>reason</th>
                  <th className={t.th}>refund</th>
                  <th className={t.th}>raised</th>
                  <th className={t.th}>status</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((r) => (
                  <tr key={r.id} className={t.tr}>
                    <td className={`${t.td} font-medium`}>{r.orderNumber}</td>
                    <td className={t.td}>
                      <p className="text-charcoal">{r.productTitle}</p>
                      {r.variantLabel ? (
                        <p className="text-xs text-charcoal/50">
                          {r.variantLabel}
                        </p>
                      ) : null}
                    </td>
                    <td className={`${t.td} max-w-xs truncate text-charcoal/75`}>
                      {r.reason}
                    </td>
                    <td className={t.td}>
                      {r.refundAmount ? formatINR(r.refundAmount) : "—"}
                    </td>
                    <td className={t.td}>{fmtDate(r.createdAt)}</td>
                    <td className={t.td}>
                      <StatusPill
                        label={r.status.replaceAll("_", " ")}
                        tone={
                          r.status === "refunded"
                            ? "ok"
                            : r.status === "rejected"
                              ? "bad"
                              : "muted"
                        }
                      />
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
          page {result.page} of {totalPages} · {result.total} total
        </p>
      ) : null}
    </div>
  );
}
