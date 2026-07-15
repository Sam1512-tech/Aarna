"use client";

import { useEffect } from "react";
import { useCartCount } from "@/store/cart-count";

/**
 * Pushes a server-fetched cart count into the client badge store. Rendered on
 * the order-confirmation page: arriving there is a soft navigation, which
 * never re-runs the storefront layout, so without this the header badge would
 * keep the pre-purchase count after the webhook clears the bought items.
 */
export function CartCountSync({ count }: { count: number }) {
  useEffect(() => {
    useCartCount.getState().set(count);
  }, [count]);
  return null;
}
