import Link from "next/link";
import type { Metadata } from "next";
import {
  AdminEmpty,
  AdminPageHeader,
  StatusPill,
  tableClasses,
} from "@/components/admin/admin-primitives";
import { AutoSubmitForm } from "@/components/admin/auto-submit-form";
import { DeleteButton } from "@/components/admin/delete-button";
import { Pagination } from "@/components/admin/pagination";
import { deleteCoupon, getAdminCoupons } from "@/lib/actions/admin/coupons";
import { formatINR } from "@/lib/utils";

export const metadata: Metadata = { title: "Admin · coupons" };

// Vercel functions default to UTC even in bom1 — pin every admin date to IST
// so timestamps match the client's phone clock.
function fmtDate(d: Date | string | null) {
  if (!d) return "never";
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
        eyebrow="Commerce"
        title="Coupons"
        intro="Discount codes customers apply at checkout."
        action={{ href: "/studio/coupons/new", label: "add coupon" }}
      />

      <AutoSubmitForm className="mt-6 flex flex-wrap items-end gap-3">
        <label className="min-w-56 flex-1">
          <span className="block text-[11px] font-medium uppercase tracking-[0.16em] text-charcoal/72">
            search
          </span>
          <input
            name="search"
            defaultValue={search ?? ""}
            placeholder="code…"
            className="mt-1.5 block w-full rounded-xl border border-cocoa/20 bg-cream px-4 py-2.5 text-base text-charcoal outline-none transition duration-500 focus:border-cocoa sm:text-sm"
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
          className="rounded-full bg-cocoa px-4 py-2 text-[11px] font-medium uppercase tracking-[0.16em] text-cream transition duration-500 hover:bg-cocoa/90"
        >
          filter
        </button>
      </AutoSubmitForm>

      <div className="mt-6">
        {result.items.length === 0 ? (
          <AdminEmpty
            title="No coupons yet"
            description="Add a code — flat amount or percentage — to offer at checkout."
            cta={{ href: "/studio/coupons/new", label: "add coupon" }}
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
                  <th className={t.th}></th>
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
                          <StatusPill label="Inactive" tone="muted" />
                        ) : expired ? (
                          <StatusPill label="Expired" tone="bad" />
                        ) : (
                          <StatusPill label="Active" tone="ok" />
                        )}
                      </td>
                      <td className={t.td}>
                        <div className="flex items-center justify-end gap-3">
                          <Link
                            href={`/studio/coupons/${c.id}`}
                            className="soft-link text-[11px] font-bold uppercase tracking-[0.16em] text-cocoa"
                          >
                            edit
                          </Link>
                          <DeleteButton
                            action={deleteCoupon}
                            id={c.id}
                            label={`delete ${c.code}`}
                            confirmMessage={`Delete coupon "${c.code}"? This cannot be undone.`}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Pagination
        page={result.page}
        totalPages={totalPages}
        basePath="/studio/coupons"
        params={{ search, active: onlyActive ? "1" : undefined, expired: onlyExpired ? "1" : undefined }}
      />
    </div>
  );
}
