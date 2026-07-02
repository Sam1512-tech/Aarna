"use client";

import Image from "next/image";
import Link from "next/link";
import { Menu, Search, ShoppingBag, UserRound, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface CategoryLink {
  name: string;
  slug: string;
}

interface SiteHeaderProps {
  categories: CategoryLink[];
}

const primaryLinks = [
  { href: "/shop/new-arrivals", label: "new chapter" },
  { href: "/collections/slow-essentials", label: "slow essentials" },
];

export function SiteHeader({ categories }: SiteHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [isTransparent, setIsTransparent] = useState(false);
  const lastScrollY = useRef(0);
  const touchStartY = useRef(0);

  useEffect(() => {
    function getScrollY() {
      return (
        document.scrollingElement?.scrollTop ||
        window.scrollY ||
        window.pageYOffset ||
        document.documentElement.scrollTop ||
        document.body.scrollTop ||
        0
      );
    }

    lastScrollY.current = getScrollY();

    function handleScroll() {
      const currentY = getScrollY();
      const scrollingDown = currentY > lastScrollY.current;

      setIsTransparent(scrollingDown && currentY > 80);
      lastScrollY.current = currentY;
    }

    const pollScroll = window.setInterval(handleScroll, 150);

    function handleWheel(event: WheelEvent) {
      const currentY = getScrollY();
      setIsTransparent(event.deltaY > 0 && currentY > 80);
    }

    function handleTouchStart(event: TouchEvent) {
      touchStartY.current = event.touches[0]?.clientY ?? 0;
    }

    function handleTouchMove(event: TouchEvent) {
      const currentTouchY = event.touches[0]?.clientY ?? touchStartY.current;
      const currentY = getScrollY();
      setIsTransparent(currentTouchY < touchStartY.current && currentY > 80);
    }

    window.addEventListener("scroll", handleScroll, { passive: true });
    document.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("wheel", handleWheel, { passive: true });
    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll);
      document.removeEventListener("scroll", handleScroll);
      window.removeEventListener("wheel", handleWheel);
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.clearInterval(pollScroll);
    };
  }, []);

  return (
    <>
      <div className="fixed inset-x-0 top-0 z-50 h-9 overflow-hidden bg-maroon text-cream">
        <div className="flex h-full w-max animate-[mobile-marquee_28s_linear_infinite] items-center gap-10 whitespace-nowrap px-4 text-[10px] font-medium uppercase tracking-[0.22em] md:text-[11px]">
          <span>slow-made pieces for everyday rituals</span>
          <span>handcrafted in small batches</span>
          <span>made to live in slowly</span>
          <span>slow-made pieces for everyday rituals</span>
        </div>
      </div>

      <header className="fixed inset-x-0 top-9 z-40 px-3 pt-3 md:px-6 md:pt-4">
        <div
          className={`mx-auto grid h-[76px] max-w-7xl grid-cols-[1fr_auto_1fr] items-center px-3 transition-all duration-1000 md:h-16 md:px-5 ${
            isTransparent
              ? "rounded-full border border-transparent bg-transparent shadow-none backdrop-blur-0 md:opacity-0 md:-translate-y-2"
              : "rounded-full border border-maroon/8 bg-cream/52 shadow-[0_18px_70px_rgba(43,38,35,0.06)] backdrop-blur-2xl opacity-100 translate-y-0"
          }`}
        >
          <div className="flex items-center justify-start md:hidden">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className="inline-flex h-10 w-10 items-center justify-center text-maroon transition duration-700 hover:-translate-y-0.5 hover:text-cocoa active:translate-y-0"
              aria-label="Open menu"
            >
              <Menu className="h-[18px] w-[18px]" aria-hidden="true" />
            </button>
          </div>

          <Link
            href="/"
            aria-label="Aarna home"
            className="col-start-2 flex h-12 w-12 items-center justify-center justify-self-center md:col-start-1 md:ml-1 md:h-12 md:w-12 md:self-center md:justify-self-start"
          >
            <Image
              src="/brand/aarna-header-logo-transparent.png"
              alt="Aarna"
              width={180}
              height={180}
              priority
              className="logo-blend h-11 w-11 object-contain md:h-11 md:w-11"
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
                wardrobe
              </Link>
              <div className="pointer-events-none absolute left-1/2 top-full w-64 -translate-x-1/2 translate-y-3 border border-maroon/10 bg-cream p-3 opacity-0 shadow-[0_24px_70px_rgba(43,38,35,0.12)] transition duration-700 group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100">
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
                    wardrobe opening soon
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
              aria-label="Bag"
              className="inline-flex h-10 w-10 items-center justify-center transition duration-700 hover:-translate-y-0.5 hover:text-cocoa active:translate-y-0"
            >
              <ShoppingBag className="h-[18px] w-[18px]" aria-hidden="true" />
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
        className={`fixed inset-0 z-[100] bg-cream transition duration-1000 md:hidden ${
          menuOpen
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0"
        }`}
        aria-hidden={!menuOpen}
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
              type="button"
              onClick={() => setMenuOpen(false)}
              className="inline-flex h-11 w-11 items-center justify-center border border-maroon/20 text-maroon transition duration-700 hover:bg-cocoa hover:text-cream"
              aria-label="Close menu"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <nav className="mt-16 flex flex-col gap-5" aria-label="Mobile">
            {primaryLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className="font-display text-[42px] lowercase leading-[1.1] text-maroon"
              >
                {link.label}
              </Link>
            ))}
            {categories.map((category) => (
              <Link
                key={category.slug}
                href={`/shop/${category.slug}`}
                onClick={() => setMenuOpen(false)}
                className="font-display text-[42px] lowercase leading-[1.1] text-maroon"
              >
                {category.name.toLowerCase()}
              </Link>
            ))}
            <Link
              href="/about"
              onClick={() => setMenuOpen(false)}
              className="font-display text-[42px] lowercase leading-[1.1] text-maroon"
            >
              about
            </Link>
            <Link
              href="/account"
              onClick={() => setMenuOpen(false)}
              className="font-display text-[42px] lowercase leading-[1.1] text-maroon"
            >
              your account
            </Link>
          </nav>

          <div className="mt-auto border-t border-maroon/14 pt-6 text-base leading-7 text-cocoa">
            <p>made to live in, shared softly, worn your way.</p>
          </div>
        </div>
      </div>
    </>
  );
}
