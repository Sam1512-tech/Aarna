import { SiteFooter } from "@/components/storefront/site-footer";
import { SiteHeader } from "@/components/storefront/site-header";
import { getCategories } from "@/lib/actions/products";
import type { Category } from "@/lib/types";

const CATEGORIES_TIMEOUT_MS = 8000;

// getCategories() now gates every storefront page through this shared
// layout, including ones that attempt static generation (see the cart-badge
// fix below). The Supabase pooler has a documented habit of occasionally
// hanging well past a normal response time — previously that only ever cost
// one slow/failed request, but a hang during `next build`'s static
// generation can eat Next's 60s per-page budget and fail the entire
// deployment. Race it against a timeout well under that budget and fall back
// to an empty list on either a rejection or a timeout: SiteHeader/SiteFooter
// already render a graceful empty state, and the next revalidatePath("/")
// from any admin category edit fixes a stale/empty result immediately.
async function getCategoriesSafe(): Promise<Category[]> {
  try {
    return await Promise.race([
      getCategories(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("getCategories timed out")),
          CATEGORIES_TIMEOUT_MS,
        ),
      ),
    ]);
  } catch (err) {
    console.error(
      "[storefront layout] getCategories failed — rendering empty nav:",
      err,
    );
    return [];
  }
}

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
  const categoryRows = await getCategoriesSafe();
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
