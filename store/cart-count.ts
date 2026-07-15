"use client";

import { create } from "zustand";

/**
 * Header cart badge count. Source of truth for the little number that sits
 * on top of the ShoppingBag icon.
 *
 * Server-hydrated on first paint (SiteHeader gets initialCount from the
 * storefront layout) and kept in sync client-side after every cart mutation
 * — every action in lib/actions/cart returns the updated CartState with an
 * itemCount, so callers just do `useCartCount.getState().set(next.itemCount)`
 * after their await.
 */
interface CartCountState {
  count: number;
  hydrated: boolean;
  set: (count: number) => void;
  reset: () => void;
}

export const useCartCount = create<CartCountState>((set) => ({
  count: 0,
  hydrated: false,
  set: (count) => set({ count: Math.max(0, count), hydrated: true }),
  reset: () => set({ count: 0, hydrated: true }),
}));
