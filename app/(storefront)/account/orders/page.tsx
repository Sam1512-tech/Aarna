import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, PackageOpen } from "lucide-react";
import { RateProductButton } from "@/components/storefront/rate-product-button";
import { getMyOrders } from "@/lib/actions/account";
import { getReviewableItems } from "@/lib/actions/reviews";
import { formatINR } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Your orders",
};

const PAYMENT_LABEL: Record<string, string> = {
  pending: "Payment pending",
  paid: "Paid",
  failed: "Payment failed",
  refunded: "Refunded",
  partially_refunded: "Partially refunded",
};

const FULFILLMENT_LABEL: Record<string, string> = {
  pending: "Preparing",
  processing: "Processing",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  returned: "Returned",
};

function fmtDate(d: Date | string | null) {
  if (!d) return "";
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function AccountOrdersPage() {
  const [orders, reviewableItems] = await Promise.all([
    getMyOrders().catch(() => []),
    getReviewableItems().catch(() => []),
  ]);

  if (orders.length === 0) {
    return <OrdersEmpty />;
  }

  const reviewableByItemId = new Map(
    reviewableItems.map((r) => [r.orderItemId, r]),
  );

  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-charcoal/55">
        your orders · {orders.length}
      </p>
      <ul className="mt-5 space-y-4">
        {orders.map((order) => {
          const created = fmtDate(order.createdAt);
          const payLabel =
            PAYMENT_LABEL[order.paymentStatus] ?? order.paymentStatus;
          const fulLabel =
            FULFILLMENT_LABEL[order.fulfillmentStatus] ??
            order.fulfillmentStatus;

          return (
            <li
              key={order.id}
              className="rounded-2xl border border-cocoa/12 bg-cream shadow-[0_10px_28px_rgba(43,38,35,0.04)]"
            >
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-cocoa/10 px-5 py-4">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-charcoal/55">
                    order · {order.orderNumber}
                  </p>
                  <p className="mt-1 text-sm text-charcoal/75">
                    placed {created}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill
                    label={payLabel}
                    tone={
                      order.paymentStatus === "paid"
                        ? "ok"
                        : order.paymentStatus === "failed"
                          ? "bad"
                          : "muted"
                    }
                  />
                  <StatusPill
                    label={fulLabel}
                    tone={
                      order.fulfillmentStatus === "delivered"
                        ? "ok"
                        : order.fulfillmentStatus === "cancelled"
                          ? "bad"
                          : "muted"
                    }
                  />
                </div>
              </div>

              <ul className="divide-y divide-cocoa/8 px-5 py-1">
                {order.items.slice(0, 3).map((it) => {
                  const reviewable = reviewableByItemId.get(it.id);
                  return (
                    <li
                      key={it.id}
                      className="flex items-center justify-between gap-4 py-3 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-display text-base text-maroon">
                          {it.productTitleSnapshot}
                        </p>
                        {it.variantLabelSnapshot ? (
                          <p className="text-xs text-charcoal/55">
                            {it.variantLabelSnapshot} · qty{" "}
                            {it.quantity}
                          </p>
                        ) : (
                          <p className="text-xs text-charcoal/55">
                            qty {it.quantity}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-4">
                        {reviewable ? (
                          <RateProductButton
                            orderItemId={reviewable.orderItemId}
                            productTitle={reviewable.productTitle}
                            existingReview={reviewable.existingReview}
                          />
                        ) : null}
                        <p className="text-charcoal">
                          {formatINR(it.lineTotal)}
                        </p>
                      </div>
                    </li>
                  );
                })}
                {order.items.length > 3 ? (
                  <li className="py-2 text-xs text-charcoal/50">
                    + {order.items.length - 3} more
                  </li>
                ) : null}
              </ul>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-cocoa/10 px-5 py-4">
                <div className="text-sm">
                  <span className="text-charcoal/55">Total </span>
                  <span className="font-display text-lg text-maroon">
                    {formatINR(order.total)}
                  </span>
                </div>
                {order.awbNumber ? (
                  <Link
                    href={`https://www.delhivery.com/tracking/${encodeURIComponent(order.awbNumber)}`}
                    target="_blank"
                    rel="noopener"
                    className="soft-link text-[11px] font-bold uppercase tracking-[0.18em] text-cocoa"
                  >
                    Track shipment
                  </Link>
                ) : (
                  <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-charcoal/40">
                    Tracking soon
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function StatusPill({
  label,
  tone,
}: {
  label: string;
  tone: "ok" | "bad" | "muted";
}) {
  const cls =
    tone === "ok"
      ? "border-cocoa/25 bg-cocoa/8 text-cocoa"
      : tone === "bad"
        ? "border-burnt-red/25 bg-burnt-red/8 text-burnt-red"
        : "border-cocoa/15 bg-cream text-charcoal/60";
  return (
    <span
      className={`rounded-full border px-3 py-1 text-[10px] font-medium uppercase tracking-[0.16em] ${cls}`}
    >
      {label}
    </span>
  );
}

function OrdersEmpty() {
  return (
    <div className="flex flex-col items-center px-4 py-14 text-center">
      <span className="inline-flex h-16 w-16 items-center justify-center rounded-full border border-cocoa/20 text-cocoa">
        <PackageOpen className="h-6 w-6" aria-hidden="true" />
      </span>
      <h2 className="mt-6 font-display text-[32px] leading-[1.1] text-maroon md:text-4xl">
        No orders yet
      </h2>
      <p className="mt-3 max-w-sm text-sm leading-7 text-charcoal/60">
        Pieces you order will live here — with tracking, invoices, and returns.
      </p>
      <Link
        href="/shop"
        className="mt-7 inline-flex items-center gap-2 border border-cocoa/24 bg-cream px-7 py-3 text-[11px] font-bold uppercase tracking-[0.24em] text-cocoa shadow-[0_14px_34px_rgba(140,106,90,0.14)] transition duration-1000 hover:bg-cocoa/12"
      >
        Enter the wardrobe
        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    </div>
  );
}
