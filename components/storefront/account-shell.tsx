"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Heart,
  LogOut,
  MapPin,
  Repeat,
  RotateCcw,
  ShoppingBag,
  User,
} from "lucide-react";
import { useTransition } from "react";
import { logout } from "@/lib/actions/auth";

interface NavItem {
  href: string;
  label: string;
  Icon: typeof User;
  exact?: boolean;
}

const NAV: NavItem[] = [
  { href: "/account", label: "dashboard", Icon: User, exact: true },
  { href: "/account/orders", label: "orders", Icon: ShoppingBag },
  { href: "/account/wishlist", label: "wishlist", Icon: Heart },
  { href: "/account/addresses", label: "addresses", Icon: MapPin },
  { href: "/account/exchanges", label: "exchanges", Icon: Repeat },
  { href: "/account/returns", label: "returns", Icon: RotateCcw },
];

interface AccountShellProps {
  displayName: string;
  children: React.ReactNode;
}

export function AccountShell({ displayName, children }: AccountShellProps) {
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  function handleSignOut() {
    startTransition(async () => {
      await logout();
      window.location.href = "/";
    });
  }

  function isActive(href: string, exact = false) {
    return exact ? pathname === href : pathname.startsWith(href);
  }

  return (
    <section className="paper-grain min-h-screen bg-cream px-5 pb-24 pt-[128px] md:px-6 md:pt-36">
      <div className="mx-auto max-w-7xl">
        <header className="fade-rise border-b border-cocoa/12 pb-8">
          <div className="flex items-start justify-between gap-4">
            <p className="text-sm font-bold uppercase tracking-[0.24em] text-cocoa">
              your account
            </p>
            {/* Mobile-only sign-out — sits top-right of the header so it's
                immediately discoverable and physically separated from nav
                destinations. Desktop keeps its sidebar sign-out below the
                nav (see below). */}
            <button
              type="button"
              onClick={handleSignOut}
              disabled={pending}
              className="inline-flex shrink-0 items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-charcoal/60 transition duration-500 hover:text-burnt-red disabled:opacity-50 lg:hidden"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              {pending ? "signing out…" : "sign out"}
            </button>
          </div>
          <h1 className="mt-4 font-display text-[40px] lowercase leading-[1.04] text-maroon md:text-6xl">
            welcome back, {displayName.toLowerCase()}.
          </h1>
        </header>

        <div className="mt-8 grid gap-10 lg:grid-cols-[230px_1fr] lg:gap-14">
          {/* Sidebar (desktop) + horizontal rail (mobile) */}
          <aside>
            {/* Mobile nav — wrap all 6 pills onto two rows so nothing is
                hidden behind a horizontal swipe. Sign-out lives in the
                header top-right on mobile (see the <header> block above). */}
            <nav
              aria-label="Account (mobile)"
              className="flex flex-wrap gap-2 pb-2 lg:hidden"
            >
              {NAV.map((item) => {
                const active = isActive(item.href, item.exact);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[11px] font-medium uppercase tracking-[0.18em] transition duration-500 ${
                      active
                        ? "border-maroon bg-maroon text-cream"
                        : "border-cocoa/22 bg-cream text-charcoal/75 hover:border-cocoa"
                    }`}
                  >
                    <item.Icon className="h-3.5 w-3.5" aria-hidden="true" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            {/* Desktop sidebar */}
            <nav
              aria-label="Account"
              className="hidden flex-col gap-1 lg:flex"
            >
              {NAV.map((item) => {
                const active = isActive(item.href, item.exact);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm lowercase transition duration-500 ${
                      active
                        ? "bg-maroon/8 font-medium text-maroon"
                        : "text-charcoal/72 hover:bg-cocoa/6 hover:text-cocoa"
                    }`}
                  >
                    <item.Icon
                      className={`h-4 w-4 ${active ? "text-maroon" : "text-cocoa"}`}
                      aria-hidden="true"
                    />
                    {item.label}
                  </Link>
                );
              })}
              <button
                type="button"
                onClick={handleSignOut}
                disabled={pending}
                className="mt-4 flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm lowercase text-charcoal/60 transition duration-500 hover:bg-burnt-red/8 hover:text-burnt-red disabled:opacity-50"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                {pending ? "signing out…" : "sign out"}
              </button>
            </nav>
          </aside>

          {/* Content */}
          <div className="fade-rise">{children}</div>
        </div>
      </div>
    </section>
  );
}
