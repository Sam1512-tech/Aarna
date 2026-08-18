import type { Metadata } from "next";
import { PaymentFailedView } from "@/components/storefront/payment-failed-view";
import { getMyOrderDetail } from "@/lib/actions/account";

export const metadata: Metadata = {
  title: "Payment couldn't be completed",
  robots: { index: false, follow: false },
};

export default async function PaymentFailedPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const { order } = await searchParams;

  // Try to load the order to show its actual payment status. Guest checkouts
  // (the action throws for unauthorized) fall through to the basic failure
  // view with just the order number, which is fine.
  let paymentStatus:
    | "pending"
    | "paid"
    | "failed"
    | "refunded"
    | "partially_refunded"
    | "cod_pending"
    | null = null;
  if (order) {
    try {
      const o = await getMyOrderDetail(order);
      paymentStatus = o?.paymentStatus ?? null;
    } catch {
      paymentStatus = null;
    }
  }

  return (
    <PaymentFailedView orderNumber={order ?? null} paymentStatus={paymentStatus} />
  );
}
