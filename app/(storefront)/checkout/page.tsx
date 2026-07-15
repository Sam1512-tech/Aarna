import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Script from "next/script";
import { CheckoutView } from "@/components/storefront/checkout-view";
import { getCart } from "@/lib/actions/cart";
import { getCurrentCustomer } from "@/lib/actions/auth";

export const metadata: Metadata = {
  title: "Checkout",
};

export default async function CheckoutPage() {
  const cart = await getCart();
  if (cart.lines.length === 0) {
    redirect("/cart");
  }

  // Checkout requires a signed-in customer (no guest orders). The proxy
  // middleware already gates /checkout, but a session can expire between
  // page loads — re-check here and bounce to login instead of rendering a
  // form whose submit is guaranteed to be rejected.
  const customer = await getCurrentCustomer().catch(() => null);
  if (!customer) {
    redirect("/login?redirect=/checkout");
  }

  const prefillEmail = customer.email ?? "";
  const prefillPhone = customer.phone ?? "";
  const prefillName = customer.fullName ?? "";

  return (
    <>
      <Script
        src="https://checkout.razorpay.com/v1/checkout.js"
        strategy="afterInteractive"
      />
      <CheckoutView
        cart={cart}
        prefill={{
          email: prefillEmail,
          phone: prefillPhone,
          fullName: prefillName,
        }}
      />
    </>
  );
}
