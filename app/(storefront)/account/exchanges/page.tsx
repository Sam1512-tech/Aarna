import type { Metadata } from "next";
import { AccountExchangesView } from "@/components/storefront/account-exchanges-view";
import { getMyOrders, getMyReturns } from "@/lib/actions/account";

export const metadata: Metadata = {
  title: "your exchanges",
};

// Same window the backend enforces on returns / exchanges — 14 days.
const EXCHANGE_WINDOW_DAYS = 14;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Reasons the user picked "size" or "changed my mind" often become exchange
// requests. We piggyback on the existing `requestReturn` action for now, with
// a marker prefix on the reason text so we can filter these back out here and
// so Sam's team can see the exchange intent in the admin returns queue.
export const EXCHANGE_REASON_PREFIX = "Exchange requested.";

export default async function AccountExchangesPage() {
  const [returns, orders] = await Promise.all([
    getMyReturns().catch(() => []),
    getMyOrders().catch(() => []),
  ]);

  const exchanges = returns.filter((r) =>
    r.reason?.startsWith(EXCHANGE_REASON_PREFIX),
  );

  // Server component — Date.now() at request time is intentional and stable
  // for this render. The react-hooks/purity rule targets client hooks.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();

  // Prevent stacking multiple exchanges against the same delivered item.
  const alreadyRequestedIds = new Set(
    returns.map(
      (r) => `${r.orderNumber}|${r.productTitle}|${r.variantLabel ?? ""}`,
    ),
  );

  const eligibleItems = orders
    .filter((o) => o.fulfillmentStatus === "delivered")
    .filter((o) => {
      const placed =
        typeof o.placedAt === "string"
          ? new Date(o.placedAt).getTime()
          : (o.placedAt?.getTime() ?? 0);
      return (now - placed) / MS_PER_DAY <= EXCHANGE_WINDOW_DAYS;
    })
    .flatMap((o) =>
      o.items
        .filter(
          (it) =>
            !alreadyRequestedIds.has(
              `${o.orderNumber}|${it.productTitleSnapshot}|${it.variantLabelSnapshot ?? ""}`,
            ),
        )
        .map((it) => ({
          orderItemId: it.id,
          orderNumber: o.orderNumber,
          productTitle: it.productTitleSnapshot,
          variantLabel: it.variantLabelSnapshot,
          quantity: it.quantity,
          lineTotal: it.lineTotal,
        })),
    );

  return (
    <AccountExchangesView
      exchanges={exchanges.map((r) => ({
        id: r.returnId,
        orderNumber: r.orderNumber,
        productTitle: r.productTitle,
        variantLabel: r.variantLabel,
        quantity: r.quantity,
        reason: r.reason ?? "",
        status: r.status,
        createdAt: r.createdAt,
      }))}
      eligibleItems={eligibleItems}
    />
  );
}
