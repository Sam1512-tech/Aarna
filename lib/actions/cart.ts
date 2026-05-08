"use server";

import type { CartState } from "@/lib/types";

const EMPTY_CART: CartState = { lines: [], subtotal: 0, itemCount: 0 };

export async function getCart(): Promise<CartState> {
  // TODO(backend): resolve cart from cookie (guest) or auth user, hydrate lines.
  return EMPTY_CART;
}

export async function addToCart(
  _variantId: string,
  _quantity: number,
): Promise<CartState> {
  // TODO(backend): upsert cart_items, return refreshed cart.
  return EMPTY_CART;
}

export async function updateCartItem(
  _variantId: string,
  _quantity: number,
): Promise<CartState> {
  // TODO(backend): set quantity, remove if 0.
  return EMPTY_CART;
}

export async function removeFromCart(
  _variantId: string,
): Promise<CartState> {
  // TODO(backend): delete cart item.
  return EMPTY_CART;
}

export async function applyCoupon(
  _code: string,
): Promise<{ ok: boolean; message: string; cart: CartState }> {
  // TODO(backend): validate coupon, attach to cart, return updated totals.
  return { ok: false, message: "Not implemented", cart: EMPTY_CART };
}

export async function mergeGuestCartOnLogin(): Promise<CartState> {
  // TODO(backend): merge cookie-keyed guest cart into the now-authenticated user's cart.
  return EMPTY_CART;
}
