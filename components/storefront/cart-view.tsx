"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Minus, Plus, ShoppingBag, X } from "lucide-react";
import { useState, useTransition } from "react";
import {
  applyCoupon,
  removeFromCart,
  updateCartItem,
} from "@/lib/actions/cart";
import type { CartLine, CartState } from "@/lib/types";

function formatPrice(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function recalc(lines: CartLine[]): CartState {
  return {
    lines,
    subtotal: lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0),
    itemCount: lines.reduce((sum, l) => sum + l.quantity, 0),
  };
}

interface CartViewProps {
  initialCart: CartState;
}

export function CartView({ initialCart }: CartViewProps) {
  const [cart, setCart] = useState<CartState>(initialCart);
  const [discount, setDiscount] = useState(0);
  const [couponCode, setCouponCode] = useState("");
  const [couponMsg, setCouponMsg] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const [isPending, startTransition] = useTransition();

  // Optimistically update locally, then persist via the server action. The
  // server return is authoritative in production; the `length > 0` guard keeps
  // the page interactive under the dev DB stub (no DATABASE_URL), which always
  // returns an empty cart.
  function changeQty(line: CartLine, nextQty: number) {
    if (nextQty < 1) return;
    const optimistic = recalc(
      cart.lines.map((l) =>
        l.variantId === line.variantId ? { ...l, quantity: nextQty } : l,
      ),
    );
    setCart(optimistic);
    startTransition(async () => {
      const next = await updateCartItem(line.variantId, nextQty);
      setCart(next.lines.length > 0 ? next : optimistic);
    });
  }

  function remove(line: CartLine) {
    const optimistic = recalc(
      cart.lines.filter((l) => l.variantId !== line.variantId),
    );
    setCart(optimistic);
    setCouponMsg(null);
    setDiscount(0);
    startTransition(async () => {
      const next = await removeFromCart(line.variantId);
      setCart(next.lines.length > 0 ? next : optimistic);
    });
  }

  function submitCoupon(event: React.FormEvent) {
    event.preventDefault();
    const code = couponCode.trim();
    if (!code) return;
    startTransition(async () => {
      const res = await applyCoupon(code);
      setCouponMsg({ ok: res.ok, text: res.message.toLowerCase() });
      setDiscount(res.ok ? res.discount : 0);
    });
  }

  if (cart.lines.length === 0) {
    return <EmptyBag />;
  }

  const total = Math.max(0, cart.subtotal - discount);

  return (
    <section className="paper-grain min-h-screen bg-cream px-5 pb-24 pt-[120px] md:px-6 md:pb-32 md:pt-36">
      <div className="mx-auto max-w-7xl">
        <header className="fade-rise border-b border-maroon/14 pb-8">
          <p className="text-sm font-bold uppercase tracking-[0.24em] text-cocoa">
            your bag
          </p>
          <h1 className="mt-4 font-display text-[44px] lowercase leading-[1.05] text-maroon md:text-6xl">
            a few things you&rsquo;re carrying.
          </h1>
          <p className="mt-4 text-base lowercase leading-7 text-charcoal/64">
            {cart.itemCount} {cart.itemCount === 1 ? "piece" : "pieces"} held for you.
          </p>
        </header>

        <div className="grid gap-12 pt-10 lg:grid-cols-[1.55fr_0.9fr] lg:gap-16">
          {/* Lines */}
          <div className="fade-rise">
            <ul>
              {cart.lines.map((line) => (
                <li
                  key={line.variantId}
                  className="flex gap-5 border-b border-cocoa/14 py-7 first:pt-0 md:gap-7"
                >
                  <div className="relative h-[140px] w-[104px] shrink-0 overflow-hidden rounded-[18px] md:h-[164px] md:w-[124px]">
                    {line.imageUrl ? (
                      <Image
                        src={line.imageUrl}
                        alt={line.productTitle}
                        fill
                        sizes="124px"
                        className="object-cover"
                      />
                    ) : (
                      <div className="cloth-window h-full w-full" />
                    )}
                  </div>

                  <div className="flex flex-1 flex-col">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h2 className="font-display text-2xl lowercase leading-tight text-maroon md:text-3xl">
                          {line.productTitle.toLowerCase()}
                        </h2>
                        {line.variantLabel ? (
                          <p className="mt-1 text-sm lowercase text-charcoal/60">
                            {line.variantLabel.toLowerCase()}
                          </p>
                        ) : null}
                        {!line.inStock ? (
                          <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.22em] text-burnt-red">
                            low stock — review at checkout
                          </p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => remove(line)}
                        disabled={isPending}
                        aria-label={`Remove ${line.productTitle}`}
                        className="inline-flex h-8 w-8 items-center justify-center text-cocoa/55 transition duration-700 hover:text-burnt-red disabled:opacity-40"
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>

                    <div className="mt-auto flex items-end justify-between gap-4 pt-5">
                      <QtyStepper
                        quantity={line.quantity}
                        disabled={isPending}
                        onDecrease={() => changeQty(line, line.quantity - 1)}
                        onIncrease={() => changeQty(line, line.quantity + 1)}
                      />
                      <div className="text-right">
                        <p className="text-base text-charcoal">
                          {formatPrice(line.unitPrice * line.quantity)}
                        </p>
                        {line.quantity > 1 ? (
                          <p className="mt-0.5 text-xs lowercase text-charcoal/50">
                            {formatPrice(line.unitPrice)} each
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <Link
              href="/shop"
              className="soft-link mt-8 inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.24em] text-cocoa"
            >
              <ArrowRight className="h-3.5 w-3.5 rotate-180" aria-hidden="true" />
              continue shopping
            </Link>
          </div>

          {/* Summary */}
          <aside className="fade-rise-late lg:sticky lg:top-36 lg:self-start">
            <div className="rounded-[22px] border border-cocoa/16 bg-cocoa/10 p-6 md:p-8">
              <h2 className="font-display text-3xl lowercase leading-tight text-maroon">
                order summary
              </h2>

              <form onSubmit={submitCoupon} className="mt-6 grid grid-cols-[1fr_auto] gap-3">
                <label className="sr-only" htmlFor="coupon">
                  Coupon code
                </label>
                <input
                  id="coupon"
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value)}
                  placeholder="coupon code"
                  className="min-h-12 border border-cocoa/20 bg-cream px-4 text-base lowercase text-charcoal outline-none transition duration-700 placeholder:text-charcoal/42 focus:border-cocoa"
                />
                <button
                  type="submit"
                  disabled={isPending || !couponCode.trim()}
                  className="min-h-12 bg-cocoa px-6 text-xs font-medium lowercase tracking-[0.22em] text-white transition duration-1000 hover:bg-cocoa/85 disabled:opacity-45"
                >
                  apply
                </button>
              </form>
              {couponMsg ? (
                <p
                  className={`mt-3 text-xs lowercase tracking-wide ${
                    couponMsg.ok ? "text-cocoa" : "text-burnt-red"
                  }`}
                >
                  {couponMsg.text}
                </p>
              ) : null}

              <dl className="mt-7 space-y-4 border-t border-maroon/12 pt-7 text-base text-charcoal/72">
                <div className="flex items-center justify-between">
                  <dt className="lowercase">subtotal</dt>
                  <dd>{formatPrice(cart.subtotal)}</dd>
                </div>
                {discount > 0 ? (
                  <div className="flex items-center justify-between text-cocoa">
                    <dt className="lowercase">discount</dt>
                    <dd>&minus;{formatPrice(discount)}</dd>
                  </div>
                ) : null}
                <div className="flex items-center justify-between">
                  <dt className="lowercase">shipping</dt>
                  <dd className="text-sm lowercase text-charcoal/55">
                    calculated at checkout
                  </dd>
                </div>
              </dl>

              <div className="mt-7 flex items-baseline justify-between border-t border-maroon/12 pt-7">
                <span className="text-sm font-bold uppercase tracking-[0.24em] text-cocoa">
                  total
                </span>
                <span className="font-display text-3xl lowercase text-maroon">
                  {formatPrice(total)}
                </span>
              </div>

              <Link
                href="/checkout"
                aria-disabled={isPending}
                className="mt-7 flex min-h-14 items-center justify-center gap-3 bg-maroon px-6 text-xs font-medium lowercase tracking-[0.24em] text-cream transition duration-1000 hover:bg-maroon/90"
              >
                proceed to checkout
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>

              <p className="mt-5 text-center text-xs lowercase leading-6 text-charcoal/52">
                taxes shown at checkout · secure payment via razorpay
              </p>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}

function QtyStepper({
  quantity,
  disabled,
  onDecrease,
  onIncrease,
}: {
  quantity: number;
  disabled: boolean;
  onDecrease: () => void;
  onIncrease: () => void;
}) {
  return (
    <div className="inline-flex items-center rounded-full border border-cocoa/24 text-maroon">
      <button
        type="button"
        onClick={onDecrease}
        disabled={disabled || quantity <= 1}
        aria-label="Decrease quantity"
        className="inline-flex h-10 w-10 items-center justify-center transition duration-500 hover:text-cocoa disabled:opacity-30"
      >
        <Minus className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      <span className="min-w-7 text-center text-sm tabular-nums">{quantity}</span>
      <button
        type="button"
        onClick={onIncrease}
        disabled={disabled}
        aria-label="Increase quantity"
        className="inline-flex h-10 w-10 items-center justify-center transition duration-500 hover:text-cocoa disabled:opacity-30"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

function EmptyBag() {
  return (
    <section className="paper-grain flex min-h-screen flex-col items-center justify-center bg-cream px-5 pb-24 pt-[140px] text-center md:pt-40">
      <div className="fade-rise flex max-w-md flex-col items-center">
        <span className="inline-flex h-20 w-20 items-center justify-center rounded-full border border-cocoa/20 text-cocoa">
          <ShoppingBag className="h-7 w-7" aria-hidden="true" />
        </span>
        <p className="mt-8 text-sm font-bold uppercase tracking-[0.24em] text-cocoa">
          your bag
        </p>
        <h1 className="mt-4 font-display text-[44px] lowercase leading-[1.05] text-maroon md:text-6xl">
          your bag is quiet for now.
        </h1>
        <p className="mt-5 text-base lowercase leading-7 text-charcoal/64">
          nothing carried yet. the first collection is being prepared with care —
          a few slow-made pieces, soon.
        </p>
        <Link
          href="/shop"
          className="mt-9 inline-flex items-center justify-center border border-cocoa/24 bg-cream px-7 py-4 text-[11px] font-bold lowercase tracking-[0.24em] text-cocoa shadow-[0_14px_34px_rgba(140,106,90,0.14)] transition duration-1000 hover:bg-cocoa/12"
        >
          enter the wardrobe
        </Link>
      </div>
    </section>
  );
}
