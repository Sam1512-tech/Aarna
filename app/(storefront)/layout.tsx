import { SiteFooter } from "@/components/storefront/site-footer";
import { SiteHeader } from "@/components/storefront/site-header";
import { getCategories } from "@/lib/actions/products";

export default async function StorefrontLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Deliberately no getCart() here. It reads the guest-cart cookie, and any
  // dynamic API read in a shared layout forces every nested page onto
  // per-request dynamic rendering — the whole storefront lost static
  // generation/ISR over one header badge (see CLAUDE.md's "Badge trade-off").
  // SiteHeader now hydrates the cart count client-side instead.
  const categoryRows = await getCategories();
  const categories = categoryRows.map((category) => ({
    name: category.name,
    slug: category.slug,
  }));

  return (
    <>
      <SiteHeader categories={categories} />
      <main className="flex-1">{children}</main>
      <SiteFooter categories={categories} />
    </>
  );
}
