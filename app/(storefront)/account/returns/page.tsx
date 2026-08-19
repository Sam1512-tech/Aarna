import type { Metadata } from "next";
import { AccountReturnsView } from "@/components/storefront/account-returns-view";
import { getMyReturns, getReturnableItems } from "@/lib/actions/account";

export const metadata: Metadata = {
  title: "Returns & exchanges",
};

export default async function AccountReturnsPage() {
  const [returns, eligibleItems] = await Promise.all([
    getMyReturns().catch(() => []),
    getReturnableItems().catch(() => []),
  ]);

  return (
    <AccountReturnsView
      returns={returns.map((r) => ({
        id: r.returnId,
        orderNumber: r.orderNumber,
        productTitle: r.productTitle,
        variantLabel: r.variantLabel,
        quantity: r.quantity,
        reason: r.reason,
        type: r.type,
        status: r.status,
        refundAmount: r.refundAmount,
        createdAt: r.createdAt,
        outboundAwb: r.outboundAwb,
        reversePickupAwb: r.reversePickupAwb,
        paymentMethod: r.paymentMethod,
        refundUpiId: r.refundUpiId,
      }))}
      eligibleItems={eligibleItems}
    />
  );
}
