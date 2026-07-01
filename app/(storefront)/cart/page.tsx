import type { Metadata } from "next";
import { CartView } from "@/components/storefront/cart-view";
import { getCart } from "@/lib/actions/cart";

export const metadata: Metadata = {
  title: "your bag",
};

export default async function CartPage() {
  const cart = await getCart();
  return <CartView initialCart={cart} />;
}
