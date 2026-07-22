import type { Metadata } from "next";
import { AdminEmpty, AdminPageHeader } from "@/components/admin/admin-primitives";
import { getAdminOrders } from "@/lib/actions/admin/orders";
import { OrdersTable } from "./orders-table";

export const metadata: Metadata = { title: "Admin · orders" };

const PAYMENT_STATUSES = [
  "pending",
  "paid",
  "failed",
  "refunded",
  "partially_refunded",
] as const;
const FULFILLMENT_STATUSES = [
  "pending",
  "processing",
  "shipped",
  "out_for_delivery",
  "delivered",
  "cancelled",
  "returned",
] as const;

type Payment = (typeof PAYMENT_STATUSES)[number];
type Fulfillment = (typeof FULFILLMENT_STATUSES)[number];

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{
    payment?: string;
    fulfillment?: string;
    search?: string;
    page?: string;
  }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const paymentStatus = (PAYMENT_STATUSES as readonly string[]).includes(params.payment ?? "")
    ? (params.payment as Payment)
    : undefined;
  const fulfillmentStatus = (FULFILLMENT_STATUSES as readonly string[]).includes(params.fulfillment ?? "")
    ? (params.fulfillment as Fulfillment)
    : undefined;
  const search = params.search?.trim() || undefined;

  const result = await getAdminOrders({
    paymentStatus,
    fulfillmentStatus,
    search,
    page,
    pageSize: 30,
  }).catch(() => ({ items: [], total: 0, page: 1, pageSize: 30 }));

  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));

  return (
    <div>
      <AdminPageHeader
        eyebrow="Commerce"
        title="Orders"
        intro="Live orders from the storefront. Filter by status or search by order number, email, or phone."
      />

      <form method="get" className="mt-6 grid gap-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
        <label>
          <span className="block text-[11px] font-medium uppercase tracking-[0.16em] text-charcoal/55">
            search
          </span>
          <input
            name="search"
            defaultValue={search ?? ""}
            placeholder="order number, email, phone"
            className="mt-1.5 block w-full rounded-xl border border-cocoa/20 bg-cream px-4 py-2.5 text-base text-charcoal outline-none transition duration-500 focus:border-cocoa sm:text-sm"
          />
        </label>
        <label>
          <span className="block text-[11px] font-medium uppercase tracking-[0.16em] text-charcoal/55">
            payment
          </span>
          <select
            name="payment"
            defaultValue={paymentStatus ?? ""}
            className="mt-1.5 block rounded-xl border border-cocoa/20 bg-cream px-4 py-2.5 text-base text-charcoal outline-none transition duration-500 focus:border-cocoa sm:text-sm"
          >
            <option value="">all</option>
            {PAYMENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="block text-[11px] font-medium uppercase tracking-[0.16em] text-charcoal/55">
            fulfillment
          </span>
          <select
            name="fulfillment"
            defaultValue={fulfillmentStatus ?? ""}
            className="mt-1.5 block rounded-xl border border-cocoa/20 bg-cream px-4 py-2.5 text-base text-charcoal outline-none transition duration-500 focus:border-cocoa sm:text-sm"
          >
            <option value="">all</option>
            {FULFILLMENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="rounded-full bg-cocoa px-4 py-2 text-[11px] font-medium uppercase tracking-[0.16em] text-cream transition duration-500 hover:bg-cocoa/90"
        >
          filter
        </button>
      </form>

      <div className="mt-6">
        {result.items.length === 0 ? (
          <AdminEmpty
            title="No orders match"
            description="Try widening the filters or clearing the search."
          />
        ) : (
          <OrdersTable items={result.items} />
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
