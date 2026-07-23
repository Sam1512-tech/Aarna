"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { db, schema } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { CartLine, CartState } from "@/lib/types";
import { ActionError } from "@/lib/action-error";
import { checkRateLimit, getClientIp, RATE_LIMITS } from "@/lib/security/rate-limit";

const {
  carts,
  cartItems,
  customers,
  productVariants,
  products,
  productImages,
  coupons,
} = schema;

const GUEST_COOKIE = "aarna_cart";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

const EMPTY_CART: CartState = { lines: [], subtotal: 0, itemCount: 0 };

// ── Helpers ──────────────────────────────────────────────────────────────────

async function getCurrentCustomerId(): Promise<string | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user?.email) return null;
    // Map Supabase auth user → customers.id (linked by email)
    const customer = await db
      .select({ id: customers.id })
      .from(customers)
      .where(eq(customers.email, data.user.email))
      .limit(1);
    return customer[0]?.id ?? null;
  } catch {
    return null;
  }
}

async function resolveOrCreateCartId(opts: { createIfMissing: boolean }) {
  const cookieStore = await cookies();
  const customerId = await getCurrentCustomerId();

  // Logged-in path
  if (customerId) {
    const existing = await db
      .select({ id: carts.id })
      .from(carts)
      .where(eq(carts.customerId, customerId))
      .limit(1);
    if (existing[0]) return existing[0].id;
    if (!opts.createIfMissing) return null;

    // Two concurrent first-time cart operations for the same signed-in
    // customer (two tabs, phone+laptop) can both reach here after both
    // missed the select above. carts.customer_id has a partial unique index
    // (WHERE customer_id IS NOT NULL — see lib/db/schema.ts) backing this:
    // the loser of the race no-ops on insert and re-selects the winner's
    // row instead of creating a second, orphaned cart.
    const [created] = await db
      .insert(carts)
      .values({ customerId })
      .onConflictDoNothing({
        target: carts.customerId,
        where: sql`${carts.customerId} IS NOT NULL`,
      })
      .returning({ id: carts.id });
    if (created) return created.id;

    const [afterRace] = await db
      .select({ id: carts.id })
      .from(carts)
      .where(eq(carts.customerId, customerId))
      .limit(1);
    return afterRace.id;
  }

  // Guest path — cookie keyed
  let guestToken = cookieStore.get(GUEST_COOKIE)?.value;
  if (guestToken) {
    const existing = await db
      .select({ id: carts.id })
      .from(carts)
      .where(eq(carts.guestToken, guestToken))
      .limit(1);
    if (existing[0]) return existing[0].id;
  }

  if (!opts.createIfMissing) return null;

  guestToken = guestToken ?? randomUUID();
  // Same defensive shape as the customer-cart branch above, against
  // carts.guest_token's existing unique constraint — a concurrent request
  // carrying the same not-yet-persisted guest cookie shouldn't be able to
  // throw a duplicate-key error or race to create two rows.
  const [created] = await db
    .insert(carts)
    .values({ guestToken })
    .onConflictDoNothing({ target: carts.guestToken })
    .returning({ id: carts.id });

  let cartId = created?.id;
  if (!cartId) {
    const [afterRace] = await db
      .select({ id: carts.id })
      .from(carts)
      .where(eq(carts.guestToken, guestToken))
      .limit(1);
    cartId = afterRace.id;
  }

  cookieStore.set(GUEST_COOKIE, guestToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });

  return cartId;
}

async function hydrateCart(cartId: string): Promise<CartState> {
  const rows = await db
    .select({
      variantId: cartItems.variantId,
      quantity: cartItems.quantity,
      productId: products.id,
      productSlug: products.slug,
      productTitle: products.title,
      size: productVariants.size,
      color: productVariants.color,
      unitPrice: productVariants.price,
      stock: productVariants.stock,
      isActive: productVariants.isActive,
    })
    .from(cartItems)
    .innerJoin(productVariants, eq(productVariants.id, cartItems.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(eq(cartItems.cartId, cartId));

  if (rows.length === 0) return EMPTY_CART;

  // Fetch first image per product in one round trip
  const productIds = [...new Set(rows.map((r) => r.productId))];
  const imageRows = await db
    .select({
      productId: productImages.productId,
      url: productImages.url,
      sortOrder: productImages.sortOrder,
    })
    .from(productImages)
    .where(inArray(productImages.productId, productIds));

  const imageByProduct = new Map<string, string>();
  for (const img of imageRows.sort((a, b) => a.sortOrder - b.sortOrder)) {
    if (!imageByProduct.has(img.productId)) {
      imageByProduct.set(img.productId, img.url);
    }
  }

  const lines: CartLine[] = rows.map((r) => ({
    variantId: r.variantId,
    productId: r.productId,
    productSlug: r.productSlug,
    productTitle: r.productTitle,
    variantLabel: [r.size, r.color].filter(Boolean).join(" / "),
    imageUrl: imageByProduct.get(r.productId) ?? null,
    unitPrice: r.unitPrice,
    quantity: r.quantity,
    inStock: r.isActive && r.stock >= r.quantity,
  }));

  const subtotal = lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
  const itemCount = lines.reduce((sum, l) => sum + l.quantity, 0);

  return { lines, subtotal, itemCount };
}

async function touchCart(cartId: string) {
  await db
    .update(carts)
    .set({ updatedAt: new Date() })
    .where(eq(carts.id, cartId));
}

// ── Public actions ───────────────────────────────────────────────────────────

export async function getCart(): Promise<CartState> {
  const cartId = await resolveOrCreateCartId({ createIfMissing: false });
  if (!cartId) return EMPTY_CART;
  return hydrateCart(cartId);
}

export async function addToCart(
  variantId: string,
  quantity: number,
): Promise<CartState> {
  if (quantity <= 0) throw new ActionError("Quantity must be positive");

  // Verify variant exists and is active
  const variant = await db
    .select({ id: productVariants.id, stock: productVariants.stock, isActive: productVariants.isActive })
    .from(productVariants)
    .where(eq(productVariants.id, variantId))
    .limit(1);
  if (!variant[0] || !variant[0].isActive) {
    throw new ActionError("Variant not available");
  }

  const cartId = await resolveOrCreateCartId({ createIfMissing: true });
  if (!cartId) throw new ActionError("Could not resolve cart");

  // Upsert — if line exists, increment quantity; else insert
  await db
    .insert(cartItems)
    .values({ cartId, variantId, quantity })
    .onConflictDoUpdate({
      target: [cartItems.cartId, cartItems.variantId],
      set: { quantity: sql`${cartItems.quantity} + ${quantity}` },
    });

  await touchCart(cartId);
  return hydrateCart(cartId);
}

export async function updateCartItem(
  variantId: string,
  quantity: number,
): Promise<CartState> {
  const cartId = await resolveOrCreateCartId({ createIfMissing: false });
  if (!cartId) return EMPTY_CART;

  if (quantity <= 0) {
    await db
      .delete(cartItems)
      .where(and(eq(cartItems.cartId, cartId), eq(cartItems.variantId, variantId)));
  } else {
    await db
      .update(cartItems)
      .set({ quantity })
      .where(and(eq(cartItems.cartId, cartId), eq(cartItems.variantId, variantId)));
  }

  await touchCart(cartId);
  return hydrateCart(cartId);
}

export async function removeFromCart(variantId: string): Promise<CartState> {
  const cartId = await resolveOrCreateCartId({ createIfMissing: false });
  if (!cartId) return EMPTY_CART;

  await db
    .delete(cartItems)
    .where(and(eq(cartItems.cartId, cartId), eq(cartItems.variantId, variantId)));

  await touchCart(cartId);
  return hydrateCart(cartId);
}

export async function applyCoupon(
  code: string,
): Promise<{ ok: boolean; message: string; cart: CartState; discount: number }> {
  const cart = await getCart();

  const ip = await getClientIp();
  const { allowed } = await checkRateLimit(`coupon-apply:ip:${ip}`, RATE_LIMITS.couponApplyByIp);
  if (!allowed) {
    return {
      ok: false,
      message: "Too many coupon attempts — please wait a few minutes and try again.",
      cart,
      discount: 0,
    };
  }

  const coupon = await db
    .select()
    .from(coupons)
    .where(eq(coupons.code, code.trim().toUpperCase()))
    .limit(1);

  if (!coupon[0]) {
    return { ok: false, message: "Invalid coupon code", cart, discount: 0 };
  }

  const c = coupon[0];

  if (!c.isActive) {
    return { ok: false, message: "Coupon is not active", cart, discount: 0 };
  }
  if (c.expiresAt && new Date(c.expiresAt) < new Date()) {
    return { ok: false, message: "Coupon has expired", cart, discount: 0 };
  }
  if (c.usageLimit !== null && c.usedCount >= c.usageLimit) {
    return { ok: false, message: "Coupon usage limit reached", cart, discount: 0 };
  }
  if (cart.subtotal < c.minOrderAmount) {
    return {
      ok: false,
      message: `Minimum order amount is ₹${c.minOrderAmount / 100}`,
      cart,
      discount: 0,
    };
  }

  const discount =
    c.type === "flat"
      ? Math.min(c.value, cart.subtotal)
      : Math.round((cart.subtotal * c.value) / 100);

  return { ok: true, message: "Coupon applied", cart, discount };
}

export async function mergeGuestCartOnLogin(): Promise<CartState> {
  const cookieStore = await cookies();
  const guestToken = cookieStore.get(GUEST_COOKIE)?.value;
  const customerId = await getCurrentCustomerId();

  if (!customerId || !guestToken) {
    return getCart();
  }

  // Find guest cart
  const guestCart = await db
    .select({ id: carts.id })
    .from(carts)
    .where(eq(carts.guestToken, guestToken))
    .limit(1);

  if (!guestCart[0]) {
    cookieStore.delete(GUEST_COOKIE);
    return getCart();
  }

  // Find or create user cart
  let userCart = await db
    .select({ id: carts.id })
    .from(carts)
    .where(eq(carts.customerId, customerId))
    .limit(1);

  if (!userCart[0]) {
    const [created] = await db
      .insert(carts)
      .values({ customerId })
      .returning({ id: carts.id });
    userCart = [created];
  }

  // Move all guest items into user cart — on conflict, sum quantities
  const guestItems = await db
    .select()
    .from(cartItems)
    .where(eq(cartItems.cartId, guestCart[0].id));

  for (const item of guestItems) {
    await db
      .insert(cartItems)
      .values({
        cartId: userCart[0].id,
        variantId: item.variantId,
        quantity: item.quantity,
      })
      .onConflictDoUpdate({
        target: [cartItems.cartId, cartItems.variantId],
        set: { quantity: sql`${cartItems.quantity} + ${item.quantity}` },
      });
  }

  // Delete guest cart and clear cookie
  await db.delete(carts).where(eq(carts.id, guestCart[0].id));
  cookieStore.delete(GUEST_COOKIE);

  await touchCart(userCart[0].id);
  return hydrateCart(userCart[0].id);
}
