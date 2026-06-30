import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PaymentProcessingView } from "@/components/storefront/payment-processing-view";

export const metadata: Metadata = {
  title: "processing your payment",
  robots: { index: false, follow: false },
};

export default async function PaymentProcessingPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const { order } = await searchParams;
  if (!order) {
    redirect("/cart");
  }
  return <PaymentProcessingView orderNumber={order} />;
}
