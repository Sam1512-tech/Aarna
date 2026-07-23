import type { Metadata } from "next";
import {
  AdminEmpty,
  AdminPageHeader,
} from "@/components/admin/admin-primitives";
import { AutoSubmitForm } from "@/components/admin/auto-submit-form";
import { Pagination } from "@/components/admin/pagination";
import { getInventory } from "@/lib/actions/admin/inventory";
import { InventoryTable } from "./inventory-table";
import { ReprintScanPanel } from "./reprint-scan-panel";

export const metadata: Metadata = { title: "Admin · inventory" };

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

  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));

  return (
    <div>
      <AdminPageHeader
        eyebrow="Catalog"
        title="Inventory"
        intro={`Stock counts per variant. Rows at or below ${LOW_STOCK_THRESHOLD} units are highlighted.`}
      />

      <div className="mt-6">
        <ReprintScanPanel />
      </div>

      <AutoSubmitForm className="mt-6 flex flex-wrap items-end gap-3">
        <label className="min-w-56 flex-1">
          <span className="block text-[11px] font-medium uppercase tracking-[0.16em] text-charcoal/55">
            search
          </span>
          {/* autoFocus lets a USB barcode scanner type a SKU + Enter and submit
              the form with zero clicks. */}
          <input
            name="search"
            defaultValue={search ?? ""}
            placeholder="sku or product title…"
            autoFocus
            className="mt-1.5 block w-full rounded-xl border border-cocoa/20 bg-cream px-4 py-2.5 text-base text-charcoal outline-none transition duration-500 focus:border-cocoa sm:text-sm"
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
          className="rounded-full bg-cocoa px-4 py-2 text-[11px] font-medium uppercase tracking-[0.16em] text-cream transition duration-500 hover:bg-cocoa/90"
        >
          filter
        </button>
      </AutoSubmitForm>

      <div className="mt-6">
        {result.items.length === 0 ? (
          <AdminEmpty
            title="No variants match"
            description="Try widening the filters or clearing the search."
          />
        ) : (
          <InventoryTable
            items={result.items.map((r) => ({
              variantId: r.variantId,
              productTitle: r.productTitle,
              size: r.size ?? null,
              color: r.color ?? null,
              sku: r.sku,
              stock: r.stock,
            }))}
          />
        )}
      </div>

      <Pagination
        page={result.page}
        totalPages={totalPages}
        basePath="/studio/inventory"
        params={{ search, low: onlyLowStock ? "1" : undefined, out: onlyOutOfStock ? "1" : undefined }}
      />
    </div>
  );
}
