import type { Metadata } from "next";
import { AccountReturnsView } from "@/components/storefront/account-returns-view";
import { getMyOrders, getMyReturns } from "@/lib/actions/account";
import { EXCHANGE_REASON_PREFIX } from "@/lib/exchange";

export const metadata: Metadata = {
  title: "Your returns",
};

const RETURN_WINDOW_DAYS = 3;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export default async function AccountReturnsPage() {
  const [allReturns, orders] = await Promise.all([
    getMyReturns().catch(() => []),
    getMyOrders().catch(() => []),
  ]);
  const returns = allReturns.filter(
    (r) => !r.reason?.startsWith(EXCHANGE_REASON_PREFIX),
  );

  // Backend enforces (delivered + within 3 days + no duplicate). We pre-filter
  // to the same set so the picker only shows genuinely-actionable items.
  const alreadyReturnedIds = new Set(
    returns.map((r) => `${r.orderNumber}|${r.productTitle}|${r.variantLabel}`),
  );

  // Server component — Date.now() at request time is intentional and stable
  // for this render. The react-hooks/purity rule targets client hooks.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const eligibleItems = orders
    .filter((o) => o.fulfillmentStatus === "delivered")
    .filter((o) => {
      const placed =
        typeof o.placedAt === "string"
          ? new Date(o.placedAt).getTime()
          : (o.placedAt?.getTime() ?? 0);
      return (now - placed) / MS_PER_DAY <= RETURN_WINDOW_DAYS;
    })
    .flatMap((o) =>
      o.items
        .filter(
          (it) =>
            !alreadyReturnedIds.has(
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
    <AccountReturnsView
      returns={returns.map((r) => ({
        id: r.returnId,
        orderNumber: r.orderNumber,
        productTitle: r.productTitle,
        variantLabel: r.variantLabel,
        quantity: r.quantity,
        reason: r.reason,
        status: r.status,
        refundAmount: r.refundAmount,
        createdAt: r.createdAt,
      }))}
      eligibleItems={eligibleItems}
    />
  );
}
