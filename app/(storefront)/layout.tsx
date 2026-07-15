import { SiteFooter } from "@/components/storefront/site-footer";
import { SiteHeader } from "@/components/storefront/site-header";
import { getCart } from "@/lib/actions/cart";
import { getCategories } from "@/lib/actions/products";

export default async function StorefrontLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [categoryRows, cart] = await Promise.all([
    getCategories(),
    // getCart is guest-cart tolerant (cookie-based) so this works signed-out
    // too. Fall back to empty on any failure so the whole layout never blows
    // up over the header badge.
    getCart().catch(() => ({ itemCount: 0 })),
  ]);
  const categories = categoryRows.map((category) => ({
    name: category.name,
    slug: category.slug,
  }));

  return (
    <>
      <SiteHeader categories={categories} initialCartCount={cart.itemCount} />
      <main className="flex-1">{children}</main>
      <SiteFooter categories={categories} />
    </>
  );
}
