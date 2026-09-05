import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Box,
  IndianRupee,
  ShoppingBag,
  Star,
} from "lucide-react";
import { getLowStockVariants } from "@/lib/actions/admin/inventory";
import { getOrderStats } from "@/lib/actions/admin/orders";
import { getPendingReviewCount } from "@/lib/actions/admin/reviews";
import { formatINR } from "@/lib/utils";

export const metadata = {
  title: "Admin · Dashboard",
};

const DAYS = 30;

export default async function AdminDashboardPage() {
  const [stats, allTimeStats, lowStock, pendingReviews] = await Promise.all([
    getOrderStats(DAYS).catch(() => null),
    // Separate call, no date filter — a rolling "last 30 days" total can
    // never be checked against Razorpay's own dashboard, which (per the
    // merchant's account) shows an all-time figure with no date range.
    // These answer two different questions; showing only one gave a real
    // false alarm the first time this shipped (see #325/#326).
    getOrderStats(null).catch(() => null),
    getLowStockVariants(5).catch(() => []),
    getPendingReviewCount().catch(() => 0),
  ]);

  const totalOrders = stats?.totalOrders ?? 0;
  const paidOrders = stats?.paidOrders ?? 0;
  const revenue = stats?.totalRevenue ?? 0;
  const counts = stats?.byFulfillmentStatus ?? null;
  const allTimePrepaidRevenue = allTimeStats?.prepaidRevenue ?? 0;
  const allTimeCodRevenue = allTimeStats?.codRevenue ?? 0;
  const allTimeRevenue = allTimeStats?.totalRevenue ?? 0;

  return (
    <div>
      <header className="border-b border-cocoa/12 pb-6">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-charcoal/55">
          Overview · last {DAYS} days
        </p>
        <h1 className="mt-2 font-display text-4xl uppercase leading-tight text-maroon">
          Dashboard
        </h1>
      </header>

      {/* KPI cards */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          Icon={ShoppingBag}
          label="Orders"
          value={String(totalOrders)}
          hint={
            totalOrders > 0
              ? `${paidOrders} paid`
              : "No orders yet in this window"
          }
        />
        <KpiCard
          Icon={IndianRupee}
          label="Revenue"
          value={formatINR(revenue)}
          hint={`From ${paidOrders} paid ${paidOrders === 1 ? "order" : "orders"}`}
        />
        <KpiCard
          Icon={AlertTriangle}
          label="Low stock"
          value={String(lowStock.length)}
          hint={
            lowStock.length > 0
              ? "Variants at or below threshold"
              : "Everything comfortably stocked"
          }
          tone={lowStock.length > 0 ? "warn" : "ok"}
        />
        <KpiCard
          Icon={Star}
          label="Reviews awaiting"
          value={String(pendingReviews)}
          hint={pendingReviews > 0 ? "Queued for moderation" : "Queue is clear"}
          tone={pendingReviews > 0 ? "warn" : "ok"}
        />
      </div>

      {/* All-time revenue — deliberately separate from the KPI cards above,
          which are all scoped to the last DAYS days. Razorpay's own
          dashboard (per the merchant) shows a lifetime total with no date
          filter, so a rolling window can never be checked against it —
          this section exists specifically for that comparison. */}
      {allTimeStats ? (
        <section className="mt-10 rounded-2xl border border-cocoa/12 bg-cream p-6 shadow-[0_10px_28px_rgba(43,38,35,0.04)]">
          <div className="border-b border-cocoa/10 pb-4">
            <h2 className="font-display text-2xl uppercase text-maroon">
              All-time revenue
            </h2>
            <p className="mt-1 text-xs text-charcoal/55">
              To check against Razorpay&apos;s own dashboard (a lifetime
              total, no date filter), compare its number to Online here —
              Razorpay never sees COD cash, so it won&apos;t match Total.
            </p>
          </div>
          <div className="mt-5 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-3">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-charcoal/55">
                Online (Razorpay)
              </p>
              <p className="mt-1 font-display text-2xl text-maroon tabular-nums">
                {formatINR(allTimePrepaidRevenue)}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-charcoal/55">
                COD (cash collected)
              </p>
              <p className="mt-1 font-display text-2xl text-maroon tabular-nums">
                {formatINR(allTimeCodRevenue)}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-charcoal/55">
                Total
              </p>
              <p className="mt-1 font-display text-2xl text-maroon tabular-nums">
                {formatINR(allTimeRevenue)}
              </p>
            </div>
          </div>
        </section>
      ) : null}

      {/* Fulfillment breakdown */}
      {counts ? (
        <section className="mt-10 rounded-2xl border border-cocoa/12 bg-cream p-6 shadow-[0_10px_28px_rgba(43,38,35,0.04)]">
          <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-cocoa/10 pb-4">
            <h2 className="font-display text-2xl uppercase text-maroon">
              Fulfillment breakdown
            </h2>
            <Link
              href="/studio/orders"
              className="soft-link text-[11px] font-bold uppercase tracking-[0.18em] text-cocoa"
            >
              View all orders
            </Link>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-4">
            {(Object.entries(counts) as [string, number][]).map(
              ([status, count]) => (
                <div key={status}>
                  <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-charcoal/55">
                    {status.replaceAll("_", " ")}
                  </p>
                  <p className="mt-1 font-display text-2xl text-maroon tabular-nums">
                    {count}
                  </p>
                </div>
              ),
            )}
          </div>
        </section>
      ) : null}

      {/* Low-stock list */}
      {lowStock.length > 0 ? (
        <section className="mt-6 rounded-2xl border border-cocoa/12 bg-cream p-6 shadow-[0_10px_28px_rgba(43,38,35,0.04)]">
          <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-cocoa/10 pb-4">
            <h2 className="font-display text-2xl uppercase text-maroon">
              Running low
            </h2>
            <Link
              href="/studio/inventory"
              className="soft-link text-[11px] font-bold uppercase tracking-[0.18em] text-cocoa"
            >
              Open inventory
            </Link>
          </div>
          <ul className="mt-4 divide-y divide-cocoa/8">
            {lowStock.slice(0, 8).map((v) => (
              <li
                key={v.variantId}
                className="flex items-center justify-between gap-4 py-3 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate text-charcoal">{v.productTitle}</p>
                  <p className="truncate text-xs text-charcoal/55">
                    {[v.size, v.color].filter(Boolean).join(" / ")} · SKU{" "}
                    {v.sku}
                  </p>
                </div>
                <span className="rounded-full border border-burnt-red/25 bg-burnt-red/8 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-burnt-red">
                  {v.stock} left
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Empty state */}
      {totalOrders === 0 && lowStock.length === 0 && pendingReviews === 0 ? (
        <section className="mt-8 flex flex-col items-center rounded-2xl border border-cocoa/12 bg-cream/70 py-14 text-center">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-full border border-cocoa/20 text-cocoa">
            <Box className="h-5 w-5" aria-hidden="true" />
          </span>
          <h2 className="mt-5 font-display text-2xl uppercase text-maroon">
            All clear
          </h2>
          <p className="mt-2 max-w-md text-sm text-charcoal/60">
            Nothing needs attention right now. Add a banner, publish a
            collection, or check inventory below.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              href="/studio/products"
              className="inline-flex items-center gap-2 rounded-full bg-cocoa px-4 py-2 text-[11px] font-medium uppercase tracking-[0.18em] text-cream transition duration-500 hover:bg-cocoa/90"
            >
              Manage products
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
            <Link
              href="/studio/banners"
              className="inline-flex items-center gap-2 rounded-full border border-cocoa/22 bg-cream px-4 py-2 text-[11px] font-medium uppercase tracking-[0.18em] text-cocoa transition duration-500 hover:border-cocoa"
            >
              Update banners
            </Link>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function KpiCard({
  Icon,
  label,
  value,
  hint,
  tone = "muted",
}: {
  Icon: typeof ShoppingBag;
  label: string;
  value: string;
  hint: string;
  tone?: "ok" | "warn" | "muted";
}) {
  const iconWrap =
    tone === "warn"
      ? "bg-burnt-red/10 text-burnt-red"
      : tone === "ok"
        ? "bg-cocoa/10 text-cocoa"
        : "bg-cocoa/10 text-cocoa";
  return (
    <article className="rounded-2xl border border-cocoa/12 bg-cream p-5 shadow-[0_10px_28px_rgba(43,38,35,0.04)]">
      <div className="flex items-center gap-3">
        <span
          className={`inline-flex h-9 w-9 items-center justify-center rounded-full ${iconWrap}`}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-charcoal/55">
          {label}
        </p>
      </div>
      <p className="mt-4 font-display text-3xl leading-none text-maroon tabular-nums">
        {value}
      </p>
      <p className="mt-2 text-xs text-charcoal/55">{hint}</p>
    </article>
  );
}
