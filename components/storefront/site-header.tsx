"use client";

import Image from "next/image";
import Link from "next/link";
import { Menu, Search, ShoppingBag, UserRound, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useCartCount } from "@/store/cart-count";

interface CategoryLink {
  name: string;
  slug: string;
}

interface SiteHeaderProps {
  categories: CategoryLink[];
  /** Server-fetched cart item count so the badge paints correctly on first
      load. Once the client hydrates, the store takes over and stays in sync
      with every cart mutation. */
  initialCartCount?: number;
}

// /shop/new-arrivals still isn't a real route (no dedicated "new arrivals"
// filter exists yet) — only add links here once they resolve to something
// real. /collections shipped, so it's back.
const primaryLinks: { href: string; label: string }[] = [
  { href: "/collections", label: "collections" },
];

export function SiteHeader({
  categories,
  initialCartCount = 0,
}: SiteHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const menuCloseRef = useRef<HTMLButtonElement>(null);
  // Guards the focus-restoration effect below from firing on initial mount
  // (menuOpen starts false) — it should only return focus to the trigger
  // after the drawer has actually been opened at least once.
  const hasOpenedRef = useRef(false);

  // Escape closes the mobile drawer, matching every other overlay in the app
  // (size-guide-modal.tsx, product-detail-view.tsx's lightbox).
  useEffect(() => {
    if (!menuOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  // Move focus into the drawer on open, and back to the trigger on close —
  // otherwise a keyboard user's focus is left on a now-hidden/inert control.
  useEffect(() => {
    if (menuOpen) {
      hasOpenedRef.current = true;
      menuCloseRef.current?.focus();
    } else if (hasOpenedRef.current) {
      menuTriggerRef.current?.focus();
    }
  }, [menuOpen]);

  // Hydrate the client store with the server value on mount so subsequent
  // navigations + mutations pick up from where the server left off. If the
  // store is already hydrated (e.g. mid-session re-render), don't clobber it
  // with a possibly-stale server value.
  useEffect(() => {
    if (!useCartCount.getState().hydrated) {
      useCartCount.getState().set(initialCartCount);
    }
  }, [initialCartCount]);
  const storeCount = useCartCount((s) => s.count);
  const storeHydrated = useCartCount((s) => s.hydrated);
  const cartCount = storeHydrated ? storeCount : initialCartCount;

  return (
    <>
      {/*
        Looping announcement marquee — the only animation kept after the rest
        of the site motion was removed. The mobile-marquee keyframe
        translates the strip 0 → -50%, so the strip must be exactly two
        identical halves: each half wraps its messages and carries its own
        trailing gap (pr-14 = gap-14) so -50% lands precisely one period
        ahead — a flex gap between bare spans leaves no gap after the last
        one and the loop visibly jumps at reset. The second half is
        aria-hidden so screen readers only announce it once. will-change
        promotes the strip to its own compositor layer.
      */}
      <div className="fixed inset-x-0 top-0 z-50 h-9 overflow-hidden bg-maroon pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] text-cream">
        <div
          className="flex h-full w-max animate-[mobile-marquee_36s_linear_infinite] items-center whitespace-nowrap text-[10px] font-medium uppercase tracking-[0.22em] md:text-[11px]"
          style={{ willChange: "transform" }}
        >
          {[false, true].map((isClone) => (
            <div
              key={isClone ? "clone" : "original"}
              aria-hidden={isClone || undefined}
              className="flex items-center gap-14 pr-14"
            >
              <span>Slow-made pieces for everyday rituals</span>
              <span>Handcrafted in small batches</span>
              <span>Made to live in slowly</span>
            </div>
          ))}
        </div>
      </div>

      <header className="fixed inset-x-0 top-9 z-40 pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] pt-3 md:pl-[max(1.5rem,env(safe-area-inset-left))] md:pr-[max(1.5rem,env(safe-area-inset-right))] md:pt-4">
        <div
          // Header stays fully visible at all times — the scroll-driven
          // fade-out has been removed. Solid semi-opaque cream fill, no
          // backdrop-filter, no state, no scroll listener.
          className="mx-auto grid h-[76px] max-w-7xl grid-cols-[1fr_auto_1fr] items-center rounded-full border border-maroon/8 bg-cream/88 px-3 shadow-[0_18px_70px_rgba(43,38,35,0.06)] md:h-16 md:px-5"
        >
          <div className="flex items-center justify-start md:hidden">
            <button
              ref={menuTriggerRef}
              type="button"
              onClick={() => setMenuOpen(true)}
              className="inline-flex h-10 w-10 items-center justify-center text-maroon transition duration-700 hover:-translate-y-0.5 hover:text-cocoa active:translate-y-0"
              aria-label="Open menu"
              aria-expanded={menuOpen}
              aria-controls="mobile-nav-drawer"
            >
              <Menu className="h-[18px] w-[18px]" aria-hidden="true" />
            </button>
          </div>

          <Link
            href="/"
            aria-label="Aarna home"
            className="col-start-2 flex h-12 w-12 items-center justify-center justify-self-center md:col-start-1 md:h-10 md:w-10 md:justify-self-start"
          >
            <Image
              src="/brand/aarna-header-logo-transparent.png"
              alt="Aarna"
              width={180}
              height={180}
              priority
              className="logo-blend h-11 w-11 object-contain md:h-10 md:w-10"
            />
          </Link>

          <nav
            aria-label="Primary"
            className="hidden items-center gap-7 justify-self-center text-[11px] font-medium uppercase tracking-[0.24em] text-charcoal/72 md:col-start-2 md:flex"
          >
            {primaryLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="soft-link py-2 transition duration-700 hover:text-cocoa"
              >
                {link.label}
              </Link>
            ))}

            <div className="group relative py-7">
              <Link
                href="/shop"
                className="soft-link py-2 transition duration-700 hover:text-cocoa"
              >
                Wardrobe
              </Link>
              <div className="pointer-events-none absolute left-1/2 top-full w-64 -translate-x-1/2 translate-y-3 border border-maroon/10 bg-cream p-3 opacity-0 shadow-[0_24px_70px_rgba(43,38,35,0.12)] transition duration-700 group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:translate-y-0 group-focus-within:opacity-100">
                {categories.length > 0 ? (
                  categories.map((category) => (
                    <Link
                      key={category.slug}
                      href={`/shop/${category.slug}`}
                      className="block px-4 py-3 text-[11px] font-medium uppercase tracking-[0.2em] text-charcoal/68 transition duration-700 hover:bg-cocoa/10 hover:text-cocoa"
                    >
                      {category.name}
                    </Link>
                  ))
                ) : (
                  <span className="block px-4 py-3 text-[11px] font-medium uppercase tracking-[0.2em] text-charcoal/42">
                    Wardrobe opening soon
                  </span>
                )}
              </div>
            </div>
          </nav>

          <div className="col-start-3 flex items-center justify-end gap-1 text-maroon">
            <Link
              href="/search"
              aria-label="Search"
              className="inline-flex h-10 w-10 items-center justify-center transition duration-700 hover:-translate-y-0.5 hover:text-cocoa active:translate-y-0"
            >
              <Search className="h-[18px] w-[18px]" aria-hidden="true" />
            </Link>
            <Link
              href="/cart"
              aria-label={
                cartCount > 0
                  ? `Bag · ${cartCount} ${cartCount === 1 ? "item" : "items"}`
                  : "Bag"
              }
              className="relative inline-flex h-10 w-10 items-center justify-center transition duration-700 hover:-translate-y-0.5 hover:text-cocoa active:translate-y-0"
            >
              <ShoppingBag className="h-[18px] w-[18px]" aria-hidden="true" />
              {cartCount > 0 ? (
                <span
                  aria-hidden="true"
                  className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-cocoa px-1 text-[10px] font-semibold leading-none text-cream tabular-nums shadow-[0_2px_6px_rgba(140,106,90,0.35)]"
                >
                  {cartCount > 9 ? "9+" : cartCount}
                </span>
              ) : null}
            </Link>
            <Link
              href="/account"
              aria-label="Account"
              className="inline-flex h-10 w-10 items-center justify-center transition duration-700 hover:-translate-y-0.5 hover:text-cocoa active:translate-y-0"
            >
              <UserRound className="h-[18px] w-[18px]" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </header>

      <div
        id="mobile-nav-drawer"
        className={`fixed inset-0 z-[100] bg-cream transition duration-1000 md:hidden ${
          menuOpen
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0"
        }`}
        aria-hidden={!menuOpen}
        // inert (not just aria-hidden) so the drawer's links/close button
        // are genuinely unfocusable while closed — aria-hidden alone still
        // left them in the tab order, an ARIA violation (axe's
        // aria-hidden-focus rule) since the panel stays mounted for its
        // fade transition rather than unmounting.
        inert={!menuOpen}
      >
        <div className="paper-grain flex h-full flex-col px-6 py-5">
          <div className="flex items-center justify-between">
            <Image
              src="/brand/aarna-header-logo-transparent.png"
              alt="Aarna"
              width={180}
              height={180}
              className="logo-blend h-14 w-14 object-contain"
            />
            <button
              ref={menuCloseRef}
              type="button"
              onClick={() => setMenuOpen(false)}
              className="inline-flex h-11 w-11 items-center justify-center border border-maroon/20 text-maroon transition duration-700 hover:bg-cocoa hover:text-cream"
              aria-label="Close menu"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          {/* Scrolls independently of the fixed logo/close row above, so a
              longer category list (or a short landscape viewport) can't
              clip the trailing links/tagline outside the reachable area. */}
          <div className="flex flex-1 flex-col overflow-y-auto">
            {/* text-maroon on the parent — anchors inherit it because the
                unlayered `a { color: inherit }` in globals.css beats Tailwind's
                text-* utilities applied directly to a link. */}
            <nav className="mt-16 flex flex-col gap-5 text-maroon" aria-label="Mobile">
              {primaryLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMenuOpen(false)}
                  className="font-display text-[36px] uppercase leading-[1.15] tracking-[0.04em] transition duration-700 hover:translate-x-1 hover:opacity-70 active:translate-x-0"
                >
                  {link.label}
                </Link>
              ))}
              {categories.map((category) => (
                <Link
                  key={category.slug}
                  href={`/shop/${category.slug}`}
                  onClick={() => setMenuOpen(false)}
                  className="font-display text-[36px] uppercase leading-[1.15] tracking-[0.04em] transition duration-700 hover:translate-x-1 hover:opacity-70 active:translate-x-0"
                >
                  {category.name}
                </Link>
              ))}
              {/* /about link removed for launch — the page hasn't been designed
                  yet, don't want a dead nav link in production. */}
              <Link
                href="/account"
                onClick={() => setMenuOpen(false)}
                className="font-display text-[36px] uppercase leading-[1.15] tracking-[0.04em] transition duration-700 hover:translate-x-1 hover:opacity-70 active:translate-x-0"
              >
                Your account
              </Link>
            </nav>

            <div className="mt-auto border-t border-maroon/14 pt-6 text-base leading-7 text-cocoa">
              <p>Made to live in, shared softly, worn your way.</p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
