"use client";

import { Heart } from "lucide-react";

/**
 * Just the interactive heart overlay — split out from ProductCard so that
 * file can stay a plain, server-callable module (toProductCardData in
 * particular needs to be invocable directly from Server Component pages;
 * putting "use client" on the whole product-card.tsx file broke exactly
 * that — PDP's related-products section calling toProductCardData() from a
 * Server Component threw "Attempted to call toProductCardData() from the
 * server but toProductCardData is on the client").
 */
export function WishlistHeartButton({
  wished,
  onToggle,
}: {
  wished: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle();
      }}
      aria-label={wished ? "Remove from wishlist" : "Add to wishlist"}
      aria-pressed={wished}
      className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full border border-cream/60 bg-cream/95 text-maroon shadow-[0_8px_20px_rgba(43,38,35,0.08)] backdrop-blur-md transition duration-500 hover:scale-105"
    >
      <Heart
        className={`h-4 w-4 transition duration-300 ${wished ? "fill-burnt-red text-burnt-red" : ""}`}
        aria-hidden="true"
      />
    </button>
  );
}
