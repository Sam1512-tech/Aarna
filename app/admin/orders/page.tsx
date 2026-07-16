import Link from "next/link";
import type { Metadata } from "next";
import {
  AdminEmpty,
  AdminPageHeader,
  StatusPill,
  tableClasses,
} from "@/components/admin/admin-primitives";
import { getAdminOrders } from "@/lib/actions/admin/orders";
import { formatINR } from "@/lib/utils";

export const metadata: Metadata = { title: "admin · orders" };

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

// Admin dates render in IST regardless of the server clock. Vercel functions
// default to UTC even in the bom1 region (region controls latency, not local
// time), so without `timeZone: 'Asia/Kolkata'` an order placed at 4 am IST
// on Aug 15 would render as "Aug 14" in the queue — off by up to 5:30 h.
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

  const t = tableClasses();
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));

  return (
    <div>
      <AdminPageHeader
        eyebrow="commerce"
        title="orders"
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
            className="mt-1.5 block w-full rounded-xl border border-cocoa/20 bg-cream px-4 py-2.5 text-sm text-charcoal outline-none transition duration-500 focus:border-cocoa"
          />
        </label>
        <label>
          <span className="block text-[11px] font-medium uppercase tracking-[0.16em] text-charcoal/55">
            payment
          </span>
          <select
            name="payment"
            defaultValue={paymentStatus ?? ""}
            className="mt-1.5 block rounded-xl border border-cocoa/20 bg-cream px-4 py-2.5 text-sm text-charcoal outline-none transition duration-500 focus:border-cocoa"
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
            className="mt-1.5 block rounded-xl border border-cocoa/20 bg-cream px-4 py-2.5 text-sm text-charcoal outline-none transition duration-500 focus:border-cocoa"
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
            title="no orders match"
            description="try widening the filters or clearing the search."
          />
        ) : (
          <div className={t.wrapper}>
            <table className={t.table}>
              <thead className={t.thead}>
                <tr>
                  <th className={t.th}>order</th>
                  <th className={t.th}>placed</th>
                  <th className={t.th}>customer</th>
                  <th className={t.th}>total</th>
                  <th className={t.th}>payment</th>
                  <th className={t.th}>fulfillment</th>
                  <th className={t.th}></th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((o) => (
                  <tr key={o.id} className={t.tr}>
                    <td className={t.td}>
                      <p className="font-medium text-charcoal">{o.orderNumber}</p>
                    </td>
                    <td className={t.td}>{fmtDate(o.createdAt)}</td>
                    <td className={t.td}>
                      <p className="text-charcoal">{o.email}</p>
                      {o.phone ? (
                        <p className="text-xs text-charcoal/50">{o.phone}</p>
                      ) : null}
                    </td>
                    <td className={t.td}>{formatINR(o.total)}</td>
                    <td className={t.td}>
                      <StatusPill
                        label={o.paymentStatus.replaceAll("_", " ")}
                        tone={
                          o.paymentStatus === "paid"
                            ? "ok"
                            : o.paymentStatus === "failed"
                              ? "bad"
                              : "muted"
                        }
                      />
                    </td>
                    <td className={t.td}>
                      <StatusPill
                        label={o.fulfillmentStatus.replaceAll("_", " ")}
                        tone={
                          o.fulfillmentStatus === "delivered"
                            ? "ok"
                            : o.fulfillmentStatus === "cancelled"
                              ? "bad"
                              : "muted"
                        }
                      />
                    </td>
                    <td className={t.td}>
                      <Link
                        href={`/admin/orders/${o.orderNumber}`}
                        className="soft-link text-[11px] font-bold uppercase tracking-[0.16em] text-cocoa"
                      >
                        open
                      </Link>
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
