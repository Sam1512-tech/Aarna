import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Script from "next/script";
import { CheckoutView } from "@/components/storefront/checkout-view";
import { getCart } from "@/lib/actions/cart";
import { getCurrentCustomer } from "@/lib/actions/auth";

export const metadata: Metadata = {
  title: "checkout",
};

export default async function CheckoutPage() {
  const cart = await getCart();
  if (cart.lines.length === 0) {
    redirect("/cart");
  }

  let prefillEmail = "";
  let prefillPhone = "";
  let prefillName = "";
  try {
    const customer = await getCurrentCustomer();
    if (customer) {
      prefillEmail = customer.email ?? "";
      prefillPhone = customer.phone ?? "";
      prefillName = customer.fullName ?? "";
    }
  } catch {
    // Guest checkout — no prefill, no error surface.
  }

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
