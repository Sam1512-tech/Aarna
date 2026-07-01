import type { Metadata } from "next";
import {
  AdminEmpty,
  AdminPageHeader,
  StatusPill,
  tableClasses,
} from "@/components/admin/admin-primitives";
import { getInventory } from "@/lib/actions/admin/inventory";

export const metadata: Metadata = { title: "admin · inventory" };

const LOW_STOCK_THRESHOLD = 5;

export default async function AdminInventoryPage({
  searchParams,
}: {
  searchParams: Promise<{
    search?: string;
    low?: string;
    out?: string;
    page?: string;
  }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const search = params.search?.trim() || undefined;
  const onlyLowStock = params.low === "1";
  const onlyOutOfStock = params.out === "1";

  const result = await getInventory({
    search,
    onlyLowStock,
    onlyOutOfStock,
    page,
    pageSize: 50,
    lowStockThreshold: LOW_STOCK_THRESHOLD,
  }).catch(() => ({ items: [], total: 0, page: 1, pageSize: 50 }));

  const t = tableClasses();
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));

  return (
    <div>
      <AdminPageHeader
        eyebrow="catalog"
        title="inventory"
        intro={`Stock counts per variant. Rows at or below ${LOW_STOCK_THRESHOLD} units are highlighted.`}
      />

      <form method="get" className="mt-6 flex flex-wrap items-end gap-3">
        <label className="min-w-56 flex-1">
          <span className="block text-[11px] font-medium uppercase tracking-[0.16em] text-charcoal/55">
            search
          </span>
          <input
            name="search"
            defaultValue={search ?? ""}
            placeholder="sku or product title…"
            className="mt-1.5 block w-full rounded-xl border border-cocoa/20 bg-cream px-4 py-2.5 text-sm text-charcoal outline-none transition duration-500 focus:border-cocoa"
          />
        </label>
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-charcoal/70">
          <input
            type="checkbox"
            name="low"
            value="1"
            defaultChecked={onlyLowStock}
            className="h-4 w-4 accent-cocoa"
          />
          low stock only
        </label>
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-charcoal/70">
          <input
            type="checkbox"
            name="out"
            value="1"
            defaultChecked={onlyOutOfStock}
            className="h-4 w-4 accent-cocoa"
          />
          out of stock only
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
            title="no variants match"
            description="try widening the filters or clearing the search."
          />
        ) : (
          <div className={t.wrapper}>
            <table className={t.table}>
              <thead className={t.thead}>
                <tr>
                  <th className={t.th}>product</th>
                  <th className={t.th}>variant</th>
                  <th className={t.th}>sku</th>
                  <th className={t.th}>stock</th>
                  <th className={t.th}></th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((row) => {
                  const low = row.stock <= LOW_STOCK_THRESHOLD;
                  const out = row.stock === 0;
                  return (
                    <tr key={row.variantId} className={t.tr}>
                      <td className={t.td}>
                        <p className="text-charcoal">{row.productTitle}</p>
                      </td>
                      <td className={t.td}>
                        {[row.size, row.color].filter(Boolean).join(" / ") || "—"}
                      </td>
                      <td className={`${t.td} font-mono text-xs`}>{row.sku}</td>
                      <td className={t.td}>
                        <span
                          className={`font-medium tabular-nums ${
                            out
                              ? "text-burnt-red"
                              : low
                                ? "text-burnt-red"
                                : "text-charcoal"
                          }`}
                        >
                          {row.stock}
                        </span>
                      </td>
                      <td className={t.td}>
                        {out ? (
                          <StatusPill label="out of stock" tone="bad" />
                        ) : low ? (
                          <StatusPill label="low" tone="warn" />
                        ) : (
                          <StatusPill label="ok" tone="ok" />
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
