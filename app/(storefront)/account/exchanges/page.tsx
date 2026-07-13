import type { Metadata } from "next";
import { AccountExchangesView } from "@/components/storefront/account-exchanges-view";
import { getMyOrders, getMyReturns } from "@/lib/actions/account";
import { EXCHANGE_REASON_PREFIX } from "@/lib/exchange";

export const metadata: Metadata = {
  title: "Your exchanges",
};

// Same window the backend enforces on returns / exchanges — 3 days (client decision Jul 11).
const EXCHANGE_WINDOW_DAYS = 3;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

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
