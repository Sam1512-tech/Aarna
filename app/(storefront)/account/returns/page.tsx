import type { Metadata } from "next";
import { AccountReturnsView } from "@/components/storefront/account-returns-view";
import { getMyOrders, getMyReturns } from "@/lib/actions/account";

export const metadata: Metadata = {
  title: "Returns & exchanges",
};

const RETURN_WINDOW_DAYS = 3;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export default async function AccountReturnsPage() {
  const [returns, orders] = await Promise.all([
    getMyReturns().catch(() => []),
    getMyOrders().catch(() => []),
  ]);

  // Returns + exchanges are unified in the view. Eligibility uses ALL rows
  // (return or exchange) as the "already requested" set — one request per
  // delivered item, regardless of type.
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
