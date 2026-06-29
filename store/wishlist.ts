"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CartLine } from "@/lib/types";

// What we keep when a piece is moved out of the bag and into the wishlist.
export type WishlistItem = Pick<
  CartLine,
  "variantId" | "productId" | "productTitle" | "variantLabel" | "imageUrl" | "unitPrice"
>;

interface WishlistState {
  items: WishlistItem[];
  add: (item: WishlistItem) => void;
  remove: (variantId: string) => void;
  has: (variantId: string) => boolean;
}

// Client-side wishlist, persisted to localStorage so it survives reloads.
// NOTE: this is the frontend half only — server persistence belongs to the
// (not-yet-built) wishlist action in lib/actions/account.ts. Wire this store
// to that action once it exists so wishlists follow the logged-in customer.
export const useWishlist = create<WishlistState>()(
  persist(
    (set, get) => ({
      items: [],
      add: (item) =>
        set((state) =>
          state.items.some((i) => i.variantId === item.variantId)
            ? state
            : { items: [...state.items, item] },
        ),
      remove: (variantId) =>
        set((state) => ({
          items: state.items.filter((i) => i.variantId !== variantId),
        })),
      has: (variantId) => get().items.some((i) => i.variantId === variantId),
    }),
    { name: "aarna-wishlist" },
  ),
);
