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

export type Product = InferSelectModel<typeof products>;
export type ProductVariant = InferSelectModel<typeof productVariants>;
export type ProductImage = InferSelectModel<typeof productImages>;
export type Category = InferSelectModel<typeof categories>;
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
}

export interface CartLine {
  variantId: string;
  productId: string;
  productTitle: string;
  variantLabel: string;
  imageUrl: string | null;
  unitPrice: number;
  quantity: number;
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

export interface CheckoutSummary {
  subtotal: number;
  discount: number;
  shippingFee: number;
  total: number;
  couponCode?: string;
}
