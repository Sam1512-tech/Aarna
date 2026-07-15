"use client";

import Link from "next/link";
import { Heart, ShoppingBag, X } from "lucide-react";
import { useState, useTransition } from "react";
import { addToCart } from "@/lib/actions/cart";
import { removeFromWishlist } from "@/lib/actions/account";
import { useCartCount } from "@/store/cart-count";
import { formatINR } from "@/lib/utils";

export interface WishlistRow {
  variantId: string;
  productSlug: string;
  productTitle: string;
  variantLabel: string | null;
  imageUrl: string | null;
  unitPrice: number;
  inStock: boolean;
}

interface AccountWishlistViewProps {
  items: WishlistRow[];
}

export function AccountWishlistView({ items: initial }: AccountWishlistViewProps) {
  const [items, setItems] = useState<WishlistRow[]>(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [movedId, setMovedId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function remove(variantId: string) {
    setBusyId(variantId);
    setError(null);
    startTransition(async () => {
      try {
        await removeFromWishlist(variantId);
        setItems((rows) => rows.filter((r) => r.variantId !== variantId));
      } catch {
        setError("Couldn't remove item");
      } finally {
        setBusyId(null);
      }
    });
  }

  function moveToBag(row: WishlistRow) {
    if (!row.inStock) return;
    setBusyId(row.variantId);
    setError(null);
    startTransition(async () => {
      try {
        const next = await addToCart(row.variantId, 1);
        useCartCount.getState().set(next.itemCount);
        await removeFromWishlist(row.variantId);
        setMovedId(row.variantId);
        window.setTimeout(() => {
          setItems((rows) => rows.filter((r) => r.variantId !== row.variantId));
          setMovedId(null);
        }, 900);
      } catch {
        setError("Couldn't move to bag");
      } finally {
        setBusyId(null);
      }
    });
  }

  if (items.length === 0) {
    return <WishlistEmpty />;
  }

  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-charcoal/55">
        wishlist · {items.length}
      </p>
      {error ? (
        <p className="mt-3 text-xs text-burnt-red">{error}</p>
      ) : null}
      <ul className="mt-5 grid gap-4 sm:grid-cols-2">
        {items.map((row) => {
          const busy = busyId === row.variantId;
          const moving = movedId === row.variantId;
          return (
            <li
              key={row.variantId}
              className={`flex gap-4 rounded-2xl border border-cocoa/12 bg-cream p-3.5 shadow-[0_10px_28px_rgba(43,38,35,0.04)] transition duration-500 ${
                moving ? "-translate-y-1 opacity-40" : ""
              }`}
            >
              <Link
                href={`/product/${row.productSlug}`}
                className="relative h-[112px] w-[86px] shrink-0 overflow-hidden rounded-xl bg-cream"
                aria-label={row.productTitle}
              >
                {row.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={row.imageUrl}
                    alt={row.productTitle}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="cloth-window h-full w-full" />
                )}
              </Link>

              <div className="flex flex-1 flex-col">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/product/${row.productSlug}`}
                      className="font-display text-lg leading-tight text-maroon"
                    >
                      {row.productTitle}
                    </Link>
                    {row.variantLabel ? (
                      <p className="mt-0.5 text-xs text-charcoal/55">
                        {row.variantLabel}
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(row.variantId)}
                    disabled={busy}
                    aria-label={`Remove ${row.productTitle}`}
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-cocoa/55 transition duration-500 hover:bg-burnt-red/10 hover:text-burnt-red disabled:opacity-40"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>

                <div className="mt-auto flex items-center justify-between gap-3 pt-3">
                  <p className="text-sm text-charcoal">
                    {formatINR(row.unitPrice)}
                  </p>
                  <button
                    type="button"
                    onClick={() => moveToBag(row)}
                    disabled={!row.inStock || busy}
                    className="inline-flex items-center gap-2 rounded-full bg-cocoa px-4 py-2 text-[10px] font-medium uppercase tracking-[0.18em] text-cream shadow-[0_8px_20px_rgba(140,106,90,0.2)] transition duration-500 hover:bg-cocoa/90 disabled:opacity-45 disabled:hover:bg-cocoa"
                  >
                    <ShoppingBag className="h-3 w-3" aria-hidden="true" />
                    {!row.inStock
                      ? "sold out"
                      : busy
                        ? "moving…"
                        : "move to bag"}
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function WishlistEmpty() {
  return (
    <div className="flex flex-col items-center px-4 py-14 text-center">
      <span className="inline-flex h-16 w-16 items-center justify-center rounded-full border border-cocoa/20 text-cocoa">
        <Heart className="h-6 w-6" aria-hidden="true" />
      </span>
      <h2 className="mt-6 font-display text-[32px] leading-[1.1] text-maroon md:text-4xl">
        No pieces saved yet
      </h2>
      <p className="mt-3 max-w-sm text-sm leading-7 text-charcoal/60">
        Tap the heart on any piece you love — it will live here so you can come
        back to it later.
      </p>
      <Link
        href="/shop"
        className="mt-7 inline-flex items-center gap-2 border border-cocoa/24 bg-cream px-7 py-3 text-[11px] font-bold uppercase tracking-[0.24em] text-cocoa shadow-[0_14px_34px_rgba(140,106,90,0.14)] transition duration-1000 hover:bg-cocoa/12"
      >
        Enter the wardrobe
      </Link>
    </div>
  );
}
