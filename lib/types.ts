import type { InferSelectModel } from "drizzle-orm";
import type {
  addresses,
  cartItems,
  carts,
  categories,
  collections,
  coupons,
  customers,
  orderItems,
  orders,
  productImages,
  productVariants,
  products,
  reviews,
} from "@/lib/db/schema";
import type { SizeChart } from "@/lib/size-chart";

export type Product = InferSelectModel<typeof products>;
export type ProductVariant = InferSelectModel<typeof productVariants>;
export type ProductImage = InferSelectModel<typeof productImages>;
/**
 * The public category shape. Omits `sizeChart` on purpose: the chart is only
 * needed on a product page and in the admin editor, so the public category
 * lists (header/footer/homepage/shop) never carry it into page payloads.
 * Admin reads that need it use `CategoryWithSizeChart`.
 */
export type Category = Omit<InferSelectModel<typeof categories>, "sizeChart">;
export type CategoryWithSizeChart = InferSelectModel<typeof categories>;
export type Collection = InferSelectModel<typeof collections>;
export type Customer = InferSelectModel<typeof customers>;
export type Address = InferSelectModel<typeof addresses>;
export type Cart = InferSelectModel<typeof carts>;
export type CartItem = InferSelectModel<typeof cartItems>;
export type Coupon = InferSelectModel<typeof coupons>;
export type Order = InferSelectModel<typeof orders>;
export type OrderItem = InferSelectModel<typeof orderItems>;
export type Review = InferSelectModel<typeof reviews>;

export interface ProductWithVariants extends Product {
  variants: ProductVariant[];
  images: ProductImage[];
  category: Category | null;
  /**
   * The size chart of the product's category; null (or absent) means "use the
   * default size guide". Set by `getProductBySlug`, the storefront loader — the
   * admin's product detail doesn't need it and leaves it out. Carried
   * separately from `category` because `category` is null while the category is
   * hidden, and a product whose category is still hidden must still show its
   * own category's chart.
   */
  sizeChart?: SizeChart | null;
}

export interface CartLine {
  variantId: string;
  productId: string;
  productSlug: string;
  productTitle: string;
  variantLabel: string;
  imageUrl: string | null;
  unitPrice: number;
  quantity: number;
  /** Real, live available stock right now (0 if the variant was deactivated)
   *  — not a cart snapshot. Lets the UI say exactly what's true: 0 vs. some
   *  vs. enough, instead of one vague inStock boolean. */
  stock: number;
  inStock: boolean;
}

export interface CartState {
  lines: CartLine[];
  subtotal: number;
  itemCount: number;
}

export interface AddressInput {
  fullName: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  pincode: string;
}

/** A saved address row from the account address book (getMyAddresses). */
export interface AddressRow extends AddressInput {
  id: string;
  isDefault: boolean;
}

export interface CheckoutSummary {
  subtotal: number;
  discount: number;
  shippingFee: number;
  /** Flat convenience fee for choosing Cash on Delivery, in paise — 0 for a
   *  prepaid order. See lib/checkout/cod.ts. */
  codFee: number;
  total: number;
  couponCode?: string;
}
