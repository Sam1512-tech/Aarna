import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OrderConfirmationView } from "@/components/storefront/order-confirmation-view";
import { getMyOrderDetail } from "@/lib/actions/account";
import type { AddressInput } from "@/lib/types";

export const metadata: Metadata = {
  title: "Thank you for your order",
  robots: { index: false, follow: false },
};

export default async function OrderConfirmationPage({
  params,
}: {
  params: Promise<{ orderNumber: string }>;
}) {
  const { orderNumber } = await params;

  // Try to load full order detail. Requires auth (the action throws otherwise);
  // guest checkouts will land in the catch and see the minimal confirmation —
  // their full details arrive by email regardless.
  let order: Awaited<ReturnType<typeof getMyOrderDetail>> | null = null;
  try {
    order = await getMyOrderDetail(orderNumber);
  } catch {
    order = null;
  }

  // If the order exists and payment definitively failed, route to the failure
  // page. Pending is treated as success here — we just landed from Razorpay
  // returning OK, and the webhook will flip it within a few seconds.
  if (order && order.paymentStatus === "failed") {
    redirect(`/payment-failed?order=${encodeURIComponent(orderNumber)}`);
  }

  const shipping = (order?.shippingAddress as AddressInput | undefined) ?? null;

  return (
    <OrderConfirmationView
      orderNumber={orderNumber}
      shipping={shipping}
      hasDetail={Boolean(order)}
      paymentStatus={order?.paymentStatus ?? null}
    />
  );
}
