import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Heart, MapPin, RotateCcw, ShoppingBag } from "lucide-react";
import { getCurrentCustomer } from "@/lib/actions/auth";
import { getMyOrders, getMyAddresses, getWishlist, getMyReturns } from "@/lib/actions/account";

export const metadata: Metadata = {
  title: "Your account",
};

export default async function AccountDashboardPage() {
  const customer = await getCurrentCustomer();
  // Layout redirects if not logged in, but keep the null-check for the type.
  if (!customer) return null;

  const [orders, addresses, wishlist, returns] = await Promise.all([
    getMyOrders().catch(() => []),
    getMyAddresses().catch(() => []),
    getWishlist().catch(() => []),
    getMyReturns().catch(() => []),
  ]);

  const tiles = [
    {
      href: "/account/orders",
      label: "Orders",
      Icon: ShoppingBag,
      count: orders.length,
      empty: "Nothing carried yet",
    },
    {
      href: "/account/wishlist",
      label: "Wishlist",
      Icon: Heart,
      count: wishlist.length,
      empty: "No pieces saved yet",
    },
    {
      href: "/account/addresses",
      label: "Addresses",
      Icon: MapPin,
      count: addresses.length,
      empty: "Add your first address",
    },
    {
      href: "/account/returns",
      label: "Returns",
      Icon: RotateCcw,
      count: returns.length,
      empty: "No returns raised",
    },
  ];

  return (
    <div>
      <div className="rounded-2xl border border-cocoa/12 bg-cream/70 p-5 text-sm text-charcoal/70">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-charcoal/55">
          Signed in as
        </p>
        <p className="mt-1.5 text-base text-charcoal">{customer.email}</p>
        {customer.phone ? (
          <p className="text-sm text-charcoal/60">{customer.phone}</p>
        ) : null}
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {tiles.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="group/tile flex items-center gap-4 rounded-2xl border border-cocoa/12 bg-cream p-5 shadow-[0_10px_28px_rgba(43,38,35,0.04)] transition duration-500 hover:-translate-y-0.5 hover:border-cocoa/25 hover:shadow-[0_18px_40px_rgba(43,38,35,0.08)]"
          >
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-cocoa/10 text-cocoa">
              <t.Icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-charcoal/60">
                {t.label}
              </p>
              <p className="mt-0.5 text-sm text-charcoal/85">
                {t.count > 0
                  ? `${t.count} ${t.count === 1 ? "item" : "items"}`
                  : t.empty}
              </p>
            </div>
            <ArrowRight
              className="h-4 w-4 text-cocoa/40 transition duration-500 group-hover/tile:translate-x-1 group-hover/tile:text-cocoa"
              aria-hidden="true"
            />
          </Link>
        ))}
      </div>
    </div>
  );
}
