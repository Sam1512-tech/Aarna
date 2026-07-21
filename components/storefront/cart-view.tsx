"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Heart, Minus, Plus, X } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import {
  applyCoupon,
  removeFromCart,
  updateCartItem,
} from "@/lib/actions/cart";
import { addToWishlist } from "@/lib/actions/account";
import {
  clearStoredCoupon,
  getStoredCoupon,
  setStoredCoupon,
} from "@/lib/cart/coupon-storage";
import { useCartCount } from "@/store/cart-count";
import type { CartLine, CartState } from "@/lib/types";
import { formatINR } from "@/lib/utils";

const SHIPPING_NOTE = "Calculated at checkout";
const TAX_NOTE = "Inclusive of taxes";
const EXIT_MS = 320;

function recalc(lines: CartLine[]): CartState {
  return {
    lines,
    subtotal: lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0),
    itemCount: lines.reduce((sum, l) => sum + l.quantity, 0),
  };
}

// "M / Sand" -> { size: "M", color: "Sand" }. variantLabel is built backend-side
// as [size, color].filter(Boolean).join(" / "), so this split recovers them.
function splitVariant(label: string) {
  const [size, ...rest] = label.split(" / ");
  return {
    size: size?.trim() || null,
    color: rest.join(" / ").trim() || null,
  };
}

interface CartViewProps {
  initialCart: CartState;
}

export function CartView({ initialCart }: CartViewProps) {
  const router = useRouter();
  const [cart, setCart] = useState<CartState>(initialCart);
  const [removing, setRemoving] = useState<Set<string>>(new Set());
  const [discount, setDiscount] = useState(0);
  const [couponCode, setCouponCode] = useState("");
  // The last successfully-applied code (distinct from the input's live text,
  // which the customer may keep editing after applying). Used to silently
  // re-validate the discount whenever the cart's subtotal changes, since the
  // discount amount is derived server-side from the subtotal.
  const [appliedCode, setAppliedCode] = useState<string | null>(null);
  const [couponMsg, setCouponMsg] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const [toast, setToast] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function flashToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast((t) => (t === message ? null : t)), 2200);
  }

  // Re-apply a coupon saved from a previous visit (e.g. reload, or coming
  // back from checkout) so the discount doesn't silently disappear.
  useEffect(() => {
    const saved = getStoredCoupon();
    if (!saved) return;
    startTransition(async () => {
      const res = await applyCoupon(saved);
      if (res.ok) {
        setCouponCode(saved);
        setAppliedCode(saved);
        setDiscount(res.discount);
      } else {
        clearStoredCoupon();
      }
    });
  }, []);

  // Persist a removal through the server action. The server return is
  // authoritative in production; the `length > 0` guard keeps the page
  // interactive under the dev DB stub (no DATABASE_URL), which returns empty.
  function persistRemoval(variantId: string, optimistic: CartState) {
    startTransition(async () => {
      const next = await removeFromCart(variantId);
      const settled = next.lines.length > 0 ? next : optimistic;
      setCart(settled);
      useCartCount.getState().set(settled.itemCount);
    });
  }

  // Play the collapse/slide-out animation, then commit the state change.
  function animateOut(variantId: string, commit: () => void) {
    setRemoving((prev) => new Set(prev).add(variantId));
    window.setTimeout(() => {
      setRemoving((prev) => {
        const next = new Set(prev);
        next.delete(variantId);
        return next;
      });
      commit();
    }, EXIT_MS);
  }

  function changeQty(line: CartLine, nextQty: number) {
    if (nextQty < 1) return;
    const optimistic = recalc(
      cart.lines.map((l) =>
        l.variantId === line.variantId ? { ...l, quantity: nextQty } : l,
      ),
    );
    setCart(optimistic);
    useCartCount.getState().set(optimistic.itemCount);
    startTransition(async () => {
      const next = await updateCartItem(line.variantId, nextQty);
      const settled = next.lines.length > 0 ? next : optimistic;
      setCart(settled);
      useCartCount.getState().set(settled.itemCount);

      // The discount is derived server-side from the subtotal, so a coupon
      // applied before this quantity change can be stale now (percentage
      // coupons scale with subtotal; flat coupons can drop below
      // minOrderAmount). Re-validate instead of leaving the old amount on
      // screen until a manual refresh.
      if (appliedCode) {
        const res = await applyCoupon(appliedCode);
        setDiscount(res.ok ? res.discount : 0);
        if (!res.ok) {
          setCouponMsg({ ok: false, text: res.message });
          setAppliedCode(null);
          clearStoredCoupon();
        }
      }
    });
  }

  function removeLine(line: CartLine) {
    const optimistic = recalc(
      cart.lines.filter((l) => l.variantId !== line.variantId),
    );
    animateOut(line.variantId, () => {
      setCart(optimistic);
      setDiscount(0);
      setCouponCode("");
      setAppliedCode(null);
      setCouponMsg(null);
      clearStoredCoupon();
      persistRemoval(line.variantId, optimistic);
    });
  }

  // Wishlist is server-backed (lib/actions/account) so it follows the
  // logged-in customer everywhere (PDP, account page). Only remove the line
  // from the cart once the wishlist write actually succeeds — if the
  // customer isn't signed in, addToWishlist throws and we send them to log
  // in instead of silently dropping the item from their bag.
  function moveToWishlist(line: CartLine) {
    startTransition(async () => {
      try {
        await addToWishlist(line.variantId);
      } catch {
        flashToast("sign in to save to wishlist");
        router.push(`/login/otp?next=${encodeURIComponent("/cart")}`);
        return;
      }
      const optimistic = recalc(
        cart.lines.filter((l) => l.variantId !== line.variantId),
      );
      animateOut(line.variantId, () => {
        setCart(optimistic);
        setDiscount(0);
        setCouponCode("");
        setAppliedCode(null);
        setCouponMsg(null);
        clearStoredCoupon();
        persistRemoval(line.variantId, optimistic);
        flashToast("Moved to wishlist");
      });
    });
  }

  function submitCoupon(event: React.FormEvent) {
    event.preventDefault();
    const code = couponCode.trim();
    if (!code) return;
    startTransition(async () => {
      const res = await applyCoupon(code);
      setCouponMsg({ ok: res.ok, text: res.message });
      setDiscount(res.ok ? res.discount : 0);
      if (res.ok) {
        setAppliedCode(code);
        setStoredCoupon(code);
      } else {
        setAppliedCode(null);
        clearStoredCoupon();
      }
    });
  }

  if (cart.lines.length === 0) {
    return <EmptyBag />;
  }

  const total = Math.max(0, cart.subtotal - discount);

  return (
    <section className="paper-grain min-h-screen bg-cream px-5 pb-24 pt-[132px] md:px-6 md:pb-32 md:pt-36">
      <div className="mx-auto max-w-7xl">
        <header className="border-b border-maroon/12 pb-8">
          <p className="text-sm font-bold uppercase tracking-[0.24em] text-cocoa">
            Your bag
          </p>
          <h1 className="mt-4 font-display text-[44px] leading-[1.05] text-maroon md:text-6xl">
            A few things you&rsquo;re carrying.
          </h1>
          <p className="mt-4 text-base leading-7 text-charcoal/60">
            {cart.itemCount} {cart.itemCount === 1 ? "piece" : "pieces"} held for you.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-10 pt-12 lg:grid-cols-[1.55fr_0.9fr] lg:gap-20 md:pt-14">
          {/* Items */}
          <div className="min-w-0">
            <ul>
              {cart.lines.map((line) => {
                const isLeaving = removing.has(line.variantId);
                return (
                  <li
                    key={line.variantId}
                    className="grid grid-cols-1 transition-all duration-300 ease-[cubic-bezier(0.19,1,0.22,1)]"
                    style={{
                      gridTemplateRows: isLeaving ? "0fr" : "1fr",
                      opacity: isLeaving ? 0 : 1,
                    }}
                  >
                    <div className="min-h-0 min-w-0 overflow-hidden">
                      <div className="pb-7 md:pb-8">
                        <CartItemCard
                          line={line}
                          leaving={isLeaving}
                          disabled={isPending}
                          onDecrease={() => changeQty(line, line.quantity - 1)}
                          onIncrease={() => changeQty(line, line.quantity + 1)}
                          onRemove={() => removeLine(line)}
                          onWishlist={() => moveToWishlist(line)}
                        />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            <Link
              href="/shop"
              className="soft-link mt-3 inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.24em] text-cocoa"
            >
              <ArrowRight className="h-3.5 w-3.5 rotate-180" aria-hidden="true" />
              Continue shopping
            </Link>
          </div>

          {/* Summary */}
          <aside className="lg:sticky lg:top-[116px] lg:self-start">
            <div className="rounded-[28px] border border-cocoa/12 bg-cream/80 p-6 shadow-[0_18px_55px_rgba(43,38,35,0.06)] backdrop-blur-sm md:p-8">
              <h2 className="font-display text-3xl leading-tight text-maroon">
                Order summary
              </h2>

              <form
                onSubmit={submitCoupon}
                className="mt-6 grid grid-cols-[1fr_auto] gap-2.5"
              >
                <label className="sr-only" htmlFor="coupon">
                  Coupon code
                </label>
                <input
                  id="coupon"
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value)}
                  placeholder="Coupon code"
                  className="min-h-12 min-w-0 rounded-xl border border-cocoa/18 bg-cream px-4 text-base text-charcoal outline-none transition duration-500 placeholder:text-charcoal/40 focus:border-cocoa"
                />
                <button
                  type="submit"
                  disabled={isPending || !couponCode.trim()}
                  className="min-h-12 rounded-xl bg-cocoa px-6 text-xs font-medium tracking-[0.22em] text-white transition duration-700 hover:bg-cocoa/85 disabled:opacity-45"
                >
                  Apply
                </button>
              </form>
              {couponMsg ? (
                <p
                  className={`mt-3 text-xs tracking-wide ${
                    couponMsg.ok ? "text-cocoa" : "text-burnt-red"
                  }`}
                >
                  {couponMsg.text}
                </p>
              ) : null}

              <dl className="mt-7 space-y-4 border-t border-maroon/10 pt-7 text-base text-charcoal/70">
                <SummaryRow label="Subtotal" value={formatINR(cart.subtotal)} />
                {discount > 0 ? (
                  <SummaryRow
                    label="Discount"
                    value={`−${formatINR(discount)}`}
                    accent
                  />
                ) : null}
                <SummaryRow label="Shipping" note={SHIPPING_NOTE} />
                <SummaryRow label="Taxes" note={TAX_NOTE} />
              </dl>

              <div className="mt-7 flex items-baseline justify-between border-t border-maroon/10 pt-7">
                <span className="text-sm font-bold uppercase tracking-[0.24em] text-cocoa">
                  Total
                </span>
                <span className="text-lg font-semibold tabular-nums text-maroon">
                  {formatINR(total)}
                </span>
              </div>

              <Link
                href="/checkout"
                aria-disabled={isPending}
                onClick={(e) => {
                  if (isPending) e.preventDefault();
                }}
                className={`group/cta mt-7 flex min-h-[58px] items-center justify-center rounded-2xl bg-maroon px-6 shadow-[0_18px_40px_rgba(74,31,31,0.22)] transition duration-700 hover:bg-maroon/90 hover:shadow-[0_22px_52px_rgba(74,31,31,0.3)] ${
                  isPending ? "pointer-events-none opacity-60" : ""
                }`}
              >
                <span className="flex items-center gap-3 text-xs font-medium tracking-[0.24em] text-cream">
                  Proceed to checkout
                  <ArrowRight
                    className="h-4 w-4 transition-transform duration-500 group-hover/cta:translate-x-1"
                    aria-hidden="true"
                  />
                </span>
              </Link>

              <p className="mt-5 text-center text-xs leading-6 text-charcoal/48">
                Secure payment via razorpay · delivered across india
              </p>
            </div>
          </aside>
        </div>
      </div>

      {/* Wishlist confirmation */}
      <div
        aria-live="polite"
        // bottom-6 plus the iPhone home-indicator safe area — the layout
        // opts into viewport-fit=cover (app/layout.tsx), so a plain
        // bottom-6 can render partly behind the home indicator on iPhone X+.
        className={`pointer-events-none fixed inset-x-0 z-[60] flex justify-center px-4 transition-all duration-500 ${
          toast ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
        }`}
        style={{ bottom: "calc(1.5rem + env(safe-area-inset-bottom))" }}
      >
        {toast ? (
          <div className="flex items-center gap-2 rounded-full border border-maroon/10 bg-cream/95 px-5 py-3 text-xs tracking-wide text-maroon shadow-[0_18px_50px_rgba(43,38,35,0.16)] backdrop-blur-xl">
            <Heart className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
            {toast}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function CartItemCard({
  line,
  leaving,
  disabled,
  onDecrease,
  onIncrease,
  onRemove,
  onWishlist,
}: {
  line: CartLine;
  leaving: boolean;
  disabled: boolean;
  onDecrease: () => void;
  onIncrease: () => void;
  onRemove: () => void;
  onWishlist: () => void;
}) {
  const { size, color } = splitVariant(line.variantLabel);

  return (
    <article
      className={`group relative flex gap-4 rounded-[24px] border border-cocoa/12 bg-cream/85 p-3 shadow-[0_12px_38px_rgba(43,38,35,0.05)] transition duration-500 hover:-translate-y-[3px] hover:border-cocoa/20 hover:shadow-[0_24px_58px_rgba(43,38,35,0.09)] md:gap-5 md:p-3.5 ${
        leaving ? "translate-x-3" : ""
      }`}
    >
      <Link
        href={`/product/${line.productSlug}`}
        aria-label={line.productTitle}
        className="relative block h-[108px] w-[82px] shrink-0 overflow-hidden rounded-[16px] md:h-[128px] md:w-[96px]"
      >
        {line.imageUrl ? (
          <Image
            src={line.imageUrl}
            alt={line.productTitle}
            fill
            sizes="96px"
            className="object-cover transition duration-700 group-hover:scale-[1.05]"
          />
        ) : (
          <div className="cloth-window h-full w-full transition duration-700 group-hover:scale-[1.05]" />
        )}
      </Link>

      <div className="min-w-0 flex flex-1 flex-col">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-xl leading-tight text-maroon md:text-2xl">
              <Link
                href={`/product/${line.productSlug}`}
                className="transition duration-500 hover:text-burnt-red"
              >
                {line.productTitle}
              </Link>
            </h2>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              {size ? <VariantChip label="Size" value={size} /> : null}
              {color ? <VariantChip label="Colour" value={color} /> : null}
            </div>
            {!line.inStock ? (
              <p className="mt-2.5 text-[10px] font-bold uppercase tracking-[0.22em] text-burnt-red">
                Low stock — review at checkout
              </p>
            ) : null}
          </div>

          <button
            type="button"
            onClick={onRemove}
            disabled={disabled}
            aria-label={`Remove ${line.productTitle}`}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-cocoa/50 transition duration-500 hover:bg-burnt-red/10 hover:text-burnt-red disabled:opacity-40"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-auto pt-5">
          <div className="flex items-end justify-between gap-3">
            <QtyStepper
              quantity={line.quantity}
              disabled={disabled}
              onDecrease={onDecrease}
              onIncrease={onIncrease}
            />
            <div className="text-right">
              <p
                key={line.quantity}
                className="text-lg text-charcoal"
              >
                {formatINR(line.unitPrice * line.quantity)}
              </p>
              {line.quantity > 1 ? (
                <p className="mt-0.5 text-xs text-charcoal/45">
                  {formatINR(line.unitPrice)} each
                </p>
              ) : null}
            </div>
          </div>

          <button
            type="button"
            onClick={onWishlist}
            disabled={disabled}
            className="group/wish mt-4 inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-cocoa/75 transition duration-500 hover:text-cocoa disabled:opacity-40"
          >
            <Heart
              className="h-3.5 w-3.5 transition-transform duration-500 group-hover/wish:scale-110"
              aria-hidden="true"
            />
            Move to wishlist
          </button>
        </div>
      </div>
    </article>
  );
}

function VariantChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5 rounded-full border border-cocoa/15 bg-cocoa/5 px-3 py-1 text-[11px] text-charcoal/70">
      <span className="text-charcoal/45">{label}</span>
      <span className="font-medium text-charcoal/85">{value}</span>
    </span>
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
    <div className="inline-flex items-center rounded-full border border-cocoa/20 bg-cream text-maroon shadow-[0_6px_18px_rgba(43,38,35,0.04)]">
      <button
        type="button"
        onClick={onDecrease}
        disabled={disabled || quantity <= 1}
        aria-label="Decrease quantity"
        className="inline-flex h-10 w-10 items-center justify-center rounded-l-full transition duration-300 hover:bg-cocoa/8 hover:text-cocoa disabled:opacity-30"
      >
        <Minus className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      <span
        key={quantity}
        className="min-w-8 text-center text-sm tabular-nums"
      >
        {quantity}
      </span>
      <button
        type="button"
        onClick={onIncrease}
        disabled={disabled}
        aria-label="Increase quantity"
        className="inline-flex h-10 w-10 items-center justify-center rounded-r-full transition duration-300 hover:bg-cocoa/8 hover:text-cocoa disabled:opacity-30"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  note,
  accent,
}: {
  label: string;
  value?: string;
  note?: string;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt>{label}</dt>
      <dd
        className={
          note
            ? "text-sm text-charcoal/50"
            : accent
              ? "text-cocoa"
              : "text-charcoal"
        }
      >
        {note ?? value}
      </dd>
    </div>
  );
}

function EmptyBag() {
  return (
    <section className="paper-grain flex min-h-screen flex-col items-center bg-cream px-5 pb-24 pt-[150px] text-center md:pt-48">
      <div className="flex max-w-md flex-col items-center">
        <BagIllustration />
        <p className="mt-9 text-sm font-bold uppercase tracking-[0.24em] text-cocoa">
          Your bag
        </p>
        <h1 className="mt-4 font-display text-[46px] leading-[1.04] text-maroon md:text-6xl">
          Your bag is empty for now
        </h1>
        <p className="mt-5 max-w-sm text-base leading-7 text-charcoal/60">
          Looks like you haven&rsquo;t added anything yet. Discover pieces
          you&rsquo;ll love.
        </p>
        <Link
          href="/shop"
          className="mt-9 inline-flex items-center justify-center border border-cocoa/24 bg-cream px-7 py-4 text-[11px] font-bold tracking-[0.24em] text-cocoa shadow-[0_14px_34px_rgba(140,106,90,0.14)] transition duration-1000 hover:bg-cocoa/12"
        >
          Enter the wardrobe
        </Link>
      </div>
    </section>
  );
}

function BagIllustration() {
  return (
    <div className="relative flex items-center justify-center">
      <div
        aria-hidden="true"
        className="absolute h-44 w-44 rounded-full bg-cocoa/8 blur-3xl"
      />
      <svg
        viewBox="0 0 120 120"
        role="img"
        aria-label="An empty shopping bag"
        className="relative h-32 w-32 text-cocoa/85 md:h-36 md:w-36"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path
          d="M33 45h54l-3.6 49.5a8 8 0 0 1-8 7.5H44.6a8 8 0 0 1-8-7.5L33 45Z"
          strokeWidth="2.2"
        />
        <path d="M47 45v-7a13 13 0 0 1 26 0v7" strokeWidth="2.2" />
        <path
          d="M60 60c1.7 5.4 3.6 7.3 9 9-5.4 1.7-7.3 3.6-9 9-1.7-5.4-3.6-7.3-9-9 5.4-1.7 7.3-3.6 9-9Z"
          strokeWidth="1.6"
          className="text-burnt-red/70"
        />
      </svg>
    </div>
  );
}
