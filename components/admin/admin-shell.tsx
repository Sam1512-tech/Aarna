"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeft,
  BarChart3,
  Boxes,
  Clapperboard,
  FolderTree,
  Image as ImageIcon,
  Layers,
  LogOut,
  Package,
  RotateCcw,
  ShoppingBag,
  Star,
  Tag,
} from "lucide-react";
import { useTransition } from "react";
import { logout } from "@/lib/actions/auth";

interface NavItem {
  href: string;
  label: string;
  Icon: typeof BarChart3;
  exact?: boolean;
}

const NAV: NavItem[] = [
  { href: "/admin", label: "dashboard", Icon: BarChart3, exact: true },
  { href: "/admin/categories", label: "categories", Icon: FolderTree },
  { href: "/admin/products", label: "products", Icon: Package },
  { href: "/admin/inventory", label: "inventory", Icon: Boxes },
  { href: "/admin/orders", label: "orders", Icon: ShoppingBag },
  { href: "/admin/returns", label: "returns", Icon: RotateCcw },
  { href: "/admin/coupons", label: "coupons", Icon: Tag },
  { href: "/admin/banners", label: "banners", Icon: ImageIcon },
  { href: "/admin/homepage-videos", label: "homepage videos", Icon: Clapperboard },
  { href: "/admin/collections", label: "collections", Icon: Layers },
  { href: "/admin/reviews", label: "reviews", Icon: Star },
];

interface AdminShellProps {
  displayName: string;
  children: React.ReactNode;
}

export function AdminShell({ displayName, children }: AdminShellProps) {
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  function handleSignOut() {
    startTransition(async () => {
      await logout();
      window.location.href = "/";
    });
  }

  function isActive(href: string, exact = false): boolean {
    return exact ? pathname === href : pathname.startsWith(href);
  }

  return (
    <div className="grid min-h-screen bg-cream text-charcoal md:grid-cols-[240px_1fr]">
      <aside className="border-b border-cocoa/12 bg-cream md:border-b-0 md:border-r">
        <div className="flex items-center justify-between px-4 py-5 md:px-5 md:py-6">
          <p className="font-display text-2xl uppercase leading-none text-maroon">
            aarna admin
          </p>
          <Link
            href="/"
            aria-label="Back to storefront"
            className="hidden text-cocoa/70 transition duration-500 hover:text-cocoa md:inline-flex"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>

        {/* Mobile: horizontal rail */}
        <nav
          aria-label="Admin (mobile)"
          className="flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-4 md:hidden [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {NAV.map((item) => {
            const active = isActive(item.href, item.exact);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`inline-flex shrink-0 snap-start items-center gap-2 rounded-full border px-3.5 py-2 text-[11px] font-medium uppercase tracking-[0.16em] transition duration-500 ${
                  active
                    ? "border-cocoa bg-cocoa text-cream"
                    : "border-cocoa/22 bg-cream text-charcoal/75 hover:border-cocoa"
                }`}
              >
                <item.Icon className="h-3.5 w-3.5" aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={handleSignOut}
            disabled={pending}
            className="inline-flex shrink-0 snap-start items-center gap-2 rounded-full border border-cocoa/22 bg-cream px-3.5 py-2 text-[11px] font-medium uppercase tracking-[0.16em] text-charcoal/75 transition duration-500 hover:border-burnt-red hover:text-burnt-red disabled:opacity-50"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
            {pending ? "signing out…" : "sign out"}
          </button>
        </nav>

        {/* Desktop: sidebar */}
        <nav
          aria-label="Admin"
          className="hidden flex-col gap-0.5 px-3 pb-6 md:flex"
        >
          {NAV.map((item) => {
            const active = isActive(item.href, item.exact);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm lowercase transition duration-500 ${
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

          <div className="mt-6 border-t border-cocoa/10 pt-4">
            <p className="px-3 text-[10px] font-medium uppercase tracking-[0.16em] text-charcoal/45">
              signed in
            </p>
            <p className="mt-1 truncate px-3 text-sm text-charcoal/80">
              {displayName}
            </p>
            <button
              type="button"
              onClick={handleSignOut}
              disabled={pending}
              className="mt-3 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm lowercase text-charcoal/65 transition duration-500 hover:bg-burnt-red/8 hover:text-burnt-red disabled:opacity-50"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              {pending ? "signing out…" : "sign out"}
            </button>
          </div>
        </nav>
      </aside>

      <section className="max-w-6xl px-5 py-8 md:px-8">{children}</section>
    </div>
  );
}
