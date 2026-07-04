import type { Metadata } from "next";
import {
  AdminEmpty,
  AdminPageHeader,
  StatusPill,
  tableClasses,
} from "@/components/admin/admin-primitives";
import { getAdminCoupons } from "@/lib/actions/admin/coupons";
import { formatINR } from "@/lib/utils";

export const metadata: Metadata = { title: "admin · coupons" };

function fmtDate(d: Date | string | null) {
  if (!d) return "never";
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function AdminCouponsPage({
  searchParams,
}: {
  searchParams: Promise<{
    search?: string;
    active?: string;
    expired?: string;
    page?: string;
  }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const search = params.search?.trim() || undefined;
  const onlyActive = params.active === "1";
  const onlyExpired = params.expired === "1";

  const result = await getAdminCoupons({
    search,
    onlyActive,
    onlyExpired,
    page,
    pageSize: 30,
  }).catch(() => ({ items: [], total: 0, page: 1, pageSize: 30 }));

  const t = tableClasses();
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));
  // Server component — Date.now() at request time is intentional.
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();

  return (
    <div>
      <AdminPageHeader
        eyebrow="commerce"
        title="coupons"
        intro="Discount codes customers apply at checkout."
        action={{ href: "/admin/coupons/new", label: "add coupon" }}
      />

      <form method="get" className="mt-6 flex flex-wrap items-end gap-3">
        <label className="min-w-56 flex-1">
          <span className="block text-[11px] font-medium uppercase tracking-[0.16em] text-charcoal/55">
            search
          </span>
          <input
            name="search"
            defaultValue={search ?? ""}
            placeholder="code…"
            className="mt-1.5 block w-full rounded-xl border border-cocoa/20 bg-cream px-4 py-2.5 text-sm text-charcoal outline-none transition duration-500 focus:border-cocoa"
          />
        </label>
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-charcoal/70">
          <input type="checkbox" name="active" value="1" defaultChecked={onlyActive} className="h-4 w-4 accent-cocoa" />
          active only
        </label>
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-charcoal/70">
          <input type="checkbox" name="expired" value="1" defaultChecked={onlyExpired} className="h-4 w-4 accent-cocoa" />
          expired only
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
            title="no coupons yet"
            description="add a code — flat amount or percentage — to offer at checkout."
            cta={{ href: "/admin/coupons/new", label: "add coupon" }}
          />
        ) : (
          <div className={t.wrapper}>
            <table className={t.table}>
              <thead className={t.thead}>
                <tr>
                  <th className={t.th}>code</th>
                  <th className={t.th}>discount</th>
                  <th className={t.th}>min order</th>
                  <th className={t.th}>used</th>
                  <th className={t.th}>expires</th>
                  <th className={t.th}>status</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((c) => {
                  const expired = c.expiresAt
                    ? new Date(c.expiresAt).getTime() < nowMs
                    : false;
                  return (
                    <tr key={c.id} className={t.tr}>
                      <td className={`${t.td} font-medium text-maroon`}>
                        {c.code}
                      </td>
                      <td className={t.td}>
                        {c.type === "flat"
                          ? formatINR(c.value)
                          : `${c.value}%`}
                      </td>
                      <td className={t.td}>
                        {c.minOrderAmount > 0
                          ? formatINR(c.minOrderAmount)
                          : "—"}
                      </td>
                      <td className={t.td}>
                        {c.usedCount}
                        {c.usageLimit ? ` / ${c.usageLimit}` : ""}
                      </td>
                      <td className={t.td}>{fmtDate(c.expiresAt)}</td>
                      <td className={t.td}>
                        {!c.isActive ? (
                          <StatusPill label="inactive" tone="muted" />
                        ) : expired ? (
                          <StatusPill label="expired" tone="bad" />
                        ) : (
                          <StatusPill label="active" tone="ok" />
                        )}
                      </td>
                    </tr>
                  );
                })}
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
