import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const NAV = [
  { href: "/admin", label: "dashboard" },
  { href: "/admin/products", label: "products" },
  { href: "/admin/inventory", label: "inventory" },
  { href: "/admin/orders", label: "orders" },
  { href: "/admin/coupons", label: "coupons" },
  { href: "/admin/banners", label: "banners" },
  { href: "/admin/collections", label: "collections" },
  { href: "/admin/reviews", label: "reviews" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirect=/admin");

  // TODO(backend): check user.id is in admins table; redirect if not.

  return (
    <div className="grid min-h-screen grid-cols-[240px_1fr] bg-cream text-charcoal">
      <aside className="border-r border-cocoa/12 bg-cream px-4 py-6">
        <p className="px-2 font-display text-2xl lowercase leading-none text-maroon">
          aarna admin
        </p>
        <nav className="mt-8 flex flex-col gap-1 text-sm lowercase text-charcoal/72">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="px-2 py-2 transition duration-700 hover:bg-cocoa/10 hover:text-cocoa"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <section className="px-8 py-8">{children}</section>
    </div>
  );
}
