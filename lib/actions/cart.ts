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
  orders,
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

  const lines: CartLine[] = rows.map((r) => {
    // A deactivated variant is exactly as unavailable to buy as zero stock —
    // collapse both into one honest number rather than a separate flag the
    // UI has to remember to check too.
    const stock = r.isActive ? r.stock : 0;
    return {
      variantId: r.variantId,
      productId: r.productId,
      productSlug: r.productSlug,
      productTitle: r.productTitle,
      variantLabel: [r.size, r.color].filter(Boolean).join(" / "),
      imageUrl: imageByProduct.get(r.productId) ?? null,
      unitPrice: r.unitPrice,
      quantity: r.quantity,
      stock,
      inStock: stock >= r.quantity,
    };
  });

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
    .select({
      id: productVariants.id,
      stock: productVariants.stock,
      isActive: productVariants.isActive,
      title: products.title,
    })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(eq(productVariants.id, variantId))
    .limit(1);
  if (!variant[0] || !variant[0].isActive) {
    throw new ActionError("This item is no longer available");
  }

  const cartId = await resolveOrCreateCartId({ createIfMissing: true });
  if (!cartId) throw new ActionError("Could not resolve cart");

  // This is a real-time honesty check, not the actual stock-safety boundary —
  // that's initCheckout's row-locked transaction, which stays the only place
  // stock is genuinely reserved. Here we're just refusing to silently accept
  // an add that's already impossible (someone else's checkout hold could
  // have taken the last unit between this page loading and this click), so
  // the customer gets a clear reason instead of a vague cart-page surprise
  // later. Plain read, not FOR UPDATE — nothing is being decremented.
  const existingLine = await db
    .select({ quantity: cartItems.quantity })
    .from(cartItems)
    .where(and(eq(cartItems.cartId, cartId), eq(cartItems.variantId, variantId)))
    .limit(1);
  const alreadyInCart = existingLine[0]?.quantity ?? 0;
  const requestedTotal = alreadyInCart + quantity;

  if (requestedTotal > variant[0].stock) {
    const remaining = Math.max(0, variant[0].stock - alreadyInCart);
    throw new ActionError(
      remaining <= 0
        ? `"${variant[0].title}" just sold out`
        : `Only ${remaining} more of "${variant[0].title}" available${alreadyInCart > 0 ? ` — you already have ${alreadyInCart} in your bag` : ""}`,
    );
  }

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
  if (c.startsAt && new Date(c.startsAt) > new Date()) {
    return { ok: false, message: "Coupon isn't active yet", cart, discount: 0 };
  }
  if (c.expiresAt && new Date(c.expiresAt) < new Date()) {
    return { ok: false, message: "Coupon has expired", cart, discount: 0 };
  }
  if (c.usageLimit !== null && c.usedCount >= c.usageLimit) {
    return { ok: false, message: "Coupon usage limit reached", cart, discount: 0 };
  }

  // Per-customer redemption limit. Only enforceable for signed-in customers
  // (guest carts have no stable identity to count redemptions against — but
  // checkout requires sign-in anyway, see requireCheckoutCustomer in
  // checkout.ts, so this always applies by the time an order is actually
  // placed). Counts actual PAID redemptions, not abandoned/failed checkouts —
  // matches how usage is counted at payment-confirmation time in
  // incrementCouponUsage (lib/db/queries/orders.ts).
  //
  // This pre-payment check is a UX nicety, not the real enforcement — it
  // only sees redemptions that have ALREADY landed as paid, so it closes
  // the sequential-reuse case (apply, pay, try applying again on a later
  // order) but is genuinely TOCTOU-racy against two concurrent checkouts
  // for the same customer+coupon (two tabs, a retried request): both can
  // see 0 prior paid redemptions here and both go on to pay. The real,
  // atomic enforcement is checkCouponPerCustomerOverage
  // (lib/db/queries/orders.ts), called from the payment.captured webhook
  // once payment is actually confirmed — same "never block a captured
  // payment, alert an admin instead" tradeoff as incrementCouponUsage's
  // own handling of the coupon's global usageLimit, just detected here
  // too so the overwhelmingly common non-racing case gets a real
  // rejection message instead of only ever finding out after paying.
  const customerId = await getCurrentCustomerId();
  if (customerId) {
    const priorRedemptions = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(orders)
      .where(
        and(
          eq(orders.customerId, customerId),
          eq(orders.couponCode, c.code),
          inArray(orders.paymentStatus, ["paid", "partially_refunded", "refunded"]),
        ),
      );
    const timesUsed = priorRedemptions[0]?.count ?? 0;
    if (timesUsed >= c.perCustomerLimit) {
      return {
        ok: false,
        message: "You've already used this coupon the maximum number of times",
        cart,
        discount: 0,
      };
    }
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
    // Same race as resolveOrCreateCartId's customer branch above, and the
    // same fix — a third call site inserting into carts by customerId with
    // no conflict handling, previously missed when that fix was written.
    // Two concurrent logins for the same customer (phone + laptop around
    // the same moment, each with their own guest cart) can both reach here
    // after both missed the select above; without onConflictDoNothing the
    // loser's plain insert now throws against the partial unique index on
    // carts.customer_id — and since callers of this function swallow any
    // exception silently (lib/actions/auth.ts's login/verifyEmailOtp both
    // .catch() this call so a cart-merge failure never blocks sign-in), the
    // loser's guest cart is never merged and never deleted: its items
    // silently vanish with no error surfaced and no log line.
    const [created] = await db
      .insert(carts)
      .values({ customerId })
      .onConflictDoNothing({
        target: carts.customerId,
        where: sql`${carts.customerId} IS NOT NULL`,
      })
      .returning({ id: carts.id });
    userCart = created
      ? [created]
      : await db
          .select({ id: carts.id })
          .from(carts)
          .where(eq(carts.customerId, customerId))
          .limit(1);
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
