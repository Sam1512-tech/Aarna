import type { Metadata } from "next";
import { AccountWishlistView } from "@/components/storefront/account-wishlist-view";
import { getWishlist } from "@/lib/actions/account";

export const metadata: Metadata = {
  title: "Your wishlist",
};

export default async function AccountWishlistPage() {
  const rows = await getWishlist().catch(() => []);
  return (
    <AccountWishlistView
      items={rows.map((r) => ({
        variantId: r.variantId,
        productSlug: r.productSlug,
        productTitle: r.productTitle,
        variantLabel: [r.size, r.color].filter(Boolean).join(" / ") || null,
        imageUrl: r.imageUrl,
        unitPrice: r.price,
        stock: r.stock,
      }))}
    />
  );
}
