"use server";

import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getCurrentCustomer } from "@/lib/actions/auth";
import type { AddressInput } from "@/lib/types";
import { ActionError } from "@/lib/action-error";
import { notifyWhatsApp, firstNameFromAddress } from "@/lib/whatsapp/notify";
import { computeIsDefaultForNewAddress } from "@/lib/address-default";
import { validateReturnPhotoUrl } from "@/lib/returns/validate-photo-url";
import { postgresErrorCode } from "@/lib/db/postgres-error";

const {
  orders,
  orderItems,
  productVariants,
  products,
  productImages,
  addresses,
  wishlists,
  returns,
} = schema;

const RETURN_WINDOW_DAYS = 3;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

async function requireCustomer() {
  const customer = await getCurrentCustomer();
  if (!customer) throw new ActionError("Unauthorized — please sign in");
  return customer;
}

// ── Orders ───────────────────────────────────────────────────────────────────

export async function getMyOrders() {
  const customer = await requireCustomer();

  const rows = await db
    .select()
    .from(orders)
    .where(eq(orders.customerId, customer.id))
    .orderBy(desc(orders.createdAt));

  if (rows.length === 0) return [];

  // Fetch items for all orders in one query. productId comes along via a
  // join — ReturnExchangeItemButton needs it to fetch exchange-target
  // variants for the product being returned.
  const orderIds = rows.map((o) => o.id);
  const items = await db
    .select({
      id: orderItems.id,
      orderId: orderItems.orderId,
      variantId: orderItems.variantId,
      productId: productVariants.productId,
      productTitleSnapshot: orderItems.productTitleSnapshot,
      variantLabelSnapshot: orderItems.variantLabelSnapshot,
      skuSnapshot: orderItems.skuSnapshot,
      unitPriceSnapshot: orderItems.unitPriceSnapshot,
      quantity: orderItems.quantity,
      lineTotal: orderItems.lineTotal,
    })
    .from(orderItems)
    .innerJoin(productVariants, eq(productVariants.id, orderItems.variantId))
    .where(inArray(orderItems.orderId, orderIds));

  const itemsByOrder = new Map<string, typeof items>();
  for (const item of items) {
    if (!itemsByOrder.has(item.orderId)) itemsByOrder.set(item.orderId, []);
    itemsByOrder.get(item.orderId)!.push(item);
  }

  return rows.map((o) => ({ ...o, items: itemsByOrder.get(o.id) ?? [] }));
}

export async function getMyOrderDetail(orderNumber: string) {
  const customer = await requireCustomer();

  const order = await db
    .select()
    .from(orders)
    .where(
      and(eq(orders.orderNumber, orderNumber), eq(orders.customerId, customer.id)),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!order) return null;

  const items = await db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, order.id));

  return { ...order, items };
}

// ── Wishlist ─────────────────────────────────────────────────────────────────

/**
 * Just the variant ids currently in the signed-in customer's wishlist — no
 * joins, no product/image data. For hydrating a heart icon's true state on
 * PDP/PLP/search cards, which only need membership, not the full wishlist
 * page's row data (that's getWishlist below). Guests aren't an error case
 * here (PDP/PLP/search are all public pages) — fails to an empty list rather
 * than throwing, same as every other "is this signed-in customer's stuff"
 * read on a page guests can also view.
 */
export async function getWishlistedVariantIds(): Promise<string[]> {
  const customer = await getCurrentCustomer();
  if (!customer) return [];
  const rows = await db
    .select({ variantId: wishlists.variantId })
    .from(wishlists)
    .where(eq(wishlists.customerId, customer.id));
  return rows.map((r) => r.variantId);
}

export async function getWishlist() {
  const customer = await requireCustomer();

  const rows = await db
    .select({
      variantId: wishlists.variantId,
      addedAt: wishlists.addedAt,
      productId: products.id,
      productSlug: products.slug,
      productTitle: products.title,
      basePrice: products.basePrice,
      variantPrice: productVariants.price,
      size: productVariants.size,
      color: productVariants.color,
      sku: productVariants.sku,
      inStock: productVariants.stock,
      isActive: productVariants.isActive,
    })
    .from(wishlists)
    .innerJoin(productVariants, eq(productVariants.id, wishlists.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(eq(wishlists.customerId, customer.id))
    .orderBy(desc(wishlists.addedAt));

  if (rows.length === 0) return [];

  // First image per product
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
    if (!imageByProduct.has(img.productId))
      imageByProduct.set(img.productId, img.url);
  }

  return rows.map((r) => {
    // Same collapse as cart's hydrateCart: a deactivated variant is exactly
    // as unavailable as zero stock — one honest number, not a separate flag
    // the UI has to remember to check too (see lib/actions/cart.ts).
    const stock = r.isActive ? r.inStock : 0;
    return {
      variantId: r.variantId,
      addedAt: r.addedAt,
      productId: r.productId,
      productSlug: r.productSlug,
      productTitle: r.productTitle,
      size: r.size,
      color: r.color,
      sku: r.sku,
      price: r.variantPrice,
      imageUrl: imageByProduct.get(r.productId) ?? null,
      stock,
      inStock: stock > 0,
    };
  });
}

export async function addToWishlist(variantId: string) {
  const customer = await requireCustomer();
  await db
    .insert(wishlists)
    .values({ customerId: customer.id, variantId })
    .onConflictDoNothing();
  return { ok: true };
}

export async function removeFromWishlist(variantId: string) {
  const customer = await requireCustomer();
  await db
    .delete(wishlists)
    .where(
      and(
        eq(wishlists.customerId, customer.id),
        eq(wishlists.variantId, variantId),
      ),
    );
  return { ok: true };
}

// ── Addresses ────────────────────────────────────────────────────────────────

export async function getMyAddresses() {
  const customer = await requireCustomer();
  return db
    .select()
    .from(addresses)
    .where(eq(addresses.customerId, customer.id))
    .orderBy(desc(addresses.isDefault), desc(addresses.createdAt));
}

export async function createAddress(input: AddressInput & { isDefault?: boolean }) {
  const customer = await requireCustomer();

  // First address auto-becomes default
  const existing = await db
    .select({ id: addresses.id })
    .from(addresses)
    .where(eq(addresses.customerId, customer.id))
    .limit(1);

  const isDefault = computeIsDefaultForNewAddress(existing.length, input.isDefault);

  // If marking default, unset others first
  if (isDefault && existing.length > 0) {
    await db
      .update(addresses)
      .set({ isDefault: false })
      .where(eq(addresses.customerId, customer.id));
  }

  const [created] = await db
    .insert(addresses)
    .values({
      customerId: customer.id,
      fullName: input.fullName,
      phone: input.phone,
      line1: input.line1,
      line2: input.line2,
      city: input.city,
      state: input.state,
      pincode: input.pincode,
      isDefault,
    })
    .returning();

  return created;
}

export async function updateAddress(id: string, input: Partial<AddressInput>) {
  const customer = await requireCustomer();

  // Verify ownership
  const owned = await db
    .select({ id: addresses.id })
    .from(addresses)
    .where(and(eq(addresses.id, id), eq(addresses.customerId, customer.id)))
    .limit(1);
  if (!owned[0]) throw new ActionError("Address not found");

  await db
    .update(addresses)
    .set({
      ...(input.fullName !== undefined && { fullName: input.fullName }),
      ...(input.phone !== undefined && { phone: input.phone }),
      ...(input.line1 !== undefined && { line1: input.line1 }),
      ...(input.line2 !== undefined && { line2: input.line2 }),
      ...(input.city !== undefined && { city: input.city }),
      ...(input.state !== undefined && { state: input.state }),
      ...(input.pincode !== undefined && { pincode: input.pincode }),
    })
    .where(eq(addresses.id, id));

  return { ok: true };
}

export async function deleteAddress(id: string) {
  const customer = await requireCustomer();
  const result = await db
    .delete(addresses)
    .where(and(eq(addresses.id, id), eq(addresses.customerId, customer.id)))
    .returning({ id: addresses.id, wasDefault: addresses.isDefault });

  if (!result[0]) throw new ActionError("Address not found");

  // If deleted address was default, promote the most recent remaining one
  if (result[0].wasDefault) {
    const next = await db
      .select({ id: addresses.id })
      .from(addresses)
      .where(eq(addresses.customerId, customer.id))
      .orderBy(desc(addresses.createdAt))
      .limit(1);
    if (next[0]) {
      await db
        .update(addresses)
        .set({ isDefault: true })
        .where(eq(addresses.id, next[0].id));
    }
  }

  return { ok: true };
}

export async function setDefaultAddress(id: string) {
  const customer = await requireCustomer();

  const owned = await db
    .select({ id: addresses.id })
    .from(addresses)
    .where(and(eq(addresses.id, id), eq(addresses.customerId, customer.id)))
    .limit(1);
  if (!owned[0]) throw new ActionError("Address not found");

  // Unset all, then set this one
  await db
    .update(addresses)
    .set({ isDefault: false })
    .where(eq(addresses.customerId, customer.id));
  await db.update(addresses).set({ isDefault: true }).where(eq(addresses.id, id));

  return { ok: true };
}

// ── Returns ──────────────────────────────────────────────────────────────────

const MAX_RETURN_PHOTOS = 3;

export interface ReturnRequestInput {
  orderItemId: string;
  reason: string;
  reasonCategory?: string;
  type: "return" | "exchange";
  /** Exchange target variant. Ignored for type "return". */
  desiredVariantId?: string;
  /** Cloudinary URLs already uploaded via POST /api/uploads/return-photo. */
  photos?: string[];
}

export async function requestReturn(input: ReturnRequestInput) {
  const customer = await requireCustomer();

  // Verify the order item belongs to this customer, and fetch order context
  const row = await db
    .select({
      orderItemId: orderItems.id,
      orderId: orders.id,
      orderNumber: orders.orderNumber,
      customerId: orders.customerId,
      fulfillmentStatus: orders.fulfillmentStatus,
      placedAt: orders.placedAt,
      deliveredAt: orders.deliveredAt,
      updatedAt: orders.updatedAt,
      lineTotal: orderItems.lineTotal,
      variantId: orderItems.variantId,
      phone: orders.phone,
      whatsappOptIn: orders.whatsappOptIn,
      shippingAddress: orders.shippingAddress,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(eq(orderItems.id, input.orderItemId))
    .limit(1);

  if (!row[0] || row[0].customerId !== customer.id) {
    throw new ActionError("Order item not found");
  }

  if (row[0].fulfillmentStatus !== "delivered") {
    throw new ActionError("Returns can only be requested after delivery");
  }

  // orders.deliveredAt is the real signal (set once, when fulfillmentStatus
  // moves to "delivered"). updatedAt is only a fallback for legacy orders
  // delivered before that column existed — any later edit to the order also
  // bumps updatedAt, so trusting it as primary would let unrelated admin
  // edits silently stretch or shrink the return window.
  const deliveredAt = row[0].deliveredAt ?? row[0].updatedAt ?? row[0].placedAt ?? new Date();
  const daysSinceDelivery =
    (Date.now() - new Date(deliveredAt).getTime()) / MS_PER_DAY;
  if (daysSinceDelivery > RETURN_WINDOW_DAYS) {
    throw new ActionError(`Return window of ${RETURN_WINDOW_DAYS} days has expired`);
  }

  // Prevent duplicate return requests for the same order item
  const existing = await db
    .select({ id: returns.id })
    .from(returns)
    .where(eq(returns.orderItemId, input.orderItemId))
    .limit(1);
  if (existing[0]) throw new ActionError("A return has already been requested for this item");

  const type = input.type;

  if (input.photos && input.photos.length > MAX_RETURN_PHOTOS) {
    throw new ActionError(`Up to ${MAX_RETURN_PHOTOS} photos`);
  }
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const photos = input.photos?.map((url) => validateReturnPhotoUrl(url, cloudName));

  let desiredVariantId: string | null = null;
  if (type === "exchange" && input.desiredVariantId) {
    // The desired variant must belong to the SAME product as the item being
    // exchanged — a customer/client bug shouldn't be able to point this at
    // an unrelated product's variant.
    const [desired] = await db
      .select({ productId: productVariants.productId })
      .from(productVariants)
      .where(eq(productVariants.id, input.desiredVariantId))
      .limit(1);
    const [current] = await db
      .select({ productId: productVariants.productId })
      .from(productVariants)
      .where(eq(productVariants.id, row[0].variantId))
      .limit(1);
    if (!desired || !current || desired.productId !== current.productId) {
      throw new ActionError("Desired variant must be for the same product");
    }
    desiredVariantId = input.desiredVariantId;
  }

  let created;
  try {
    [created] = await db
      .insert(returns)
      .values({
        orderItemId: input.orderItemId,
        reason: input.reason,
        reasonCategory: input.reasonCategory,
        refundAmount: row[0].lineTotal,
        type,
        desiredVariantId,
        photos: photos ?? [],
      })
      .returning();
  } catch (err) {
    // The check-then-insert above (existing[0]) closes the common
    // sequential case, but returns.order_item_id also carries a real
    // unique constraint now (return_order_item_idx) — the actual guard
    // against two near-simultaneous requests for the same item racing
    // past that plain read before either insert commits. Without this
    // catch, the loser's raw Postgres unique-violation would surface as
    // this app's generic masked production error instead of the same
    // clear message the non-racing duplicate check already gives.
    //
    // Drizzle wraps the real driver error in its own DrizzleQueryError —
    // the actual PostgresError (with the SQLSTATE `code` Postgres sends)
    // lives at `.cause`, not directly on the caught error. Confirmed by
    // reading the raw error live against the dev DB: checking `err.code`
    // directly (what this looked like on first pass) never matches
    // anything real and would silently never catch the race at all.
    if (postgresErrorCode(err) === "23505") {
      throw new ActionError("A return has already been requested for this item");
    }
    throw err;
  }

  await notifyWhatsApp({
    orderId: row[0].orderId,
    phone: row[0].phone,
    whatsappOptIn: row[0].whatsappOptIn,
    templateKey: "return_requested",
    bodyValues: [
      firstNameFromAddress(row[0].shippingAddress),
      type,
      row[0].orderNumber,
    ],
  });

  return created;
}

export async function getMyReturns() {
  const customer = await requireCustomer();

  return db
    .select({
      returnId: returns.id,
      reason: returns.reason,
      type: returns.type,
      status: returns.status,
      refundAmount: returns.refundAmount,
      createdAt: returns.createdAt,
      resolvedAt: returns.resolvedAt,
      orderNumber: orders.orderNumber,
      productTitle: orderItems.productTitleSnapshot,
      variantLabel: orderItems.variantLabelSnapshot,
      quantity: orderItems.quantity,
      photos: returns.photos,
      desiredVariantId: returns.desiredVariantId,
      rejectionReason: returns.rejectionReason,
      adminNote: returns.adminNote,
      qcOutcome: returns.qcOutcome,
    })
    .from(returns)
    .innerJoin(orderItems, eq(orderItems.id, returns.orderItemId))
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(eq(orders.customerId, customer.id))
    .orderBy(desc(returns.createdAt));
}

export interface ReturnableItem {
  orderItemId: string;
  orderNumber: string;
  productId: string;
  productTitle: string;
  variantId: string;
  variantLabel: string | null;
  quantity: number;
  lineTotal: number;
}

/**
 * Delivered, unreturned, still-within-window order items — the picker in
 * ReturnExchangeModal. Extracted from what was previously inlined (and
 * placedAt-based, a real bug — a slow delivery could sit outside the
 * placedAt-measured window while requestReturn's own deliveredAt-based
 * check would still have allowed it) directly in the account/returns page.
 */
export async function getReturnableItems(): Promise<ReturnableItem[]> {
  const customer = await requireCustomer();

  const candidates = await db
    .select({
      orderItemId: orderItems.id,
      orderNumber: orders.orderNumber,
      productId: productVariants.productId,
      productTitle: orderItems.productTitleSnapshot,
      variantId: orderItems.variantId,
      variantLabel: orderItems.variantLabelSnapshot,
      quantity: orderItems.quantity,
      lineTotal: orderItems.lineTotal,
      deliveredAt: orders.deliveredAt,
      placedAt: orders.placedAt,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .innerJoin(productVariants, eq(productVariants.id, orderItems.variantId))
    .where(
      and(
        eq(orders.customerId, customer.id),
        eq(orders.fulfillmentStatus, "delivered"),
      ),
    );

  if (candidates.length === 0) return [];

  const existing = await db
    .select({ orderItemId: returns.orderItemId })
    .from(returns)
    .where(
      inArray(
        returns.orderItemId,
        candidates.map((c) => c.orderItemId),
      ),
    );
  const alreadyRequested = new Set(existing.map((r) => r.orderItemId));

  const now = Date.now();
  return candidates
    .filter((c) => !alreadyRequested.has(c.orderItemId))
    .filter((c) => {
      const reference = c.deliveredAt ?? c.placedAt;
      const ts = reference ? new Date(reference).getTime() : 0;
      return (now - ts) / MS_PER_DAY <= RETURN_WINDOW_DAYS;
    })
    .map(({ deliveredAt: _deliveredAt, placedAt: _placedAt, ...rest }) => rest);
}

// ── Profile ──────────────────────────────────────────────────────────────────

export async function updateProfile(input: {
  fullName?: string;
  phone?: string;
  whatsappOptIn?: boolean;
}) {
  const customer = await requireCustomer();

  await db
    .update(schema.customers)
    .set({
      ...(input.fullName !== undefined && { fullName: input.fullName }),
      ...(input.phone !== undefined && { phone: input.phone }),
      ...(input.whatsappOptIn !== undefined && {
        whatsappOptIn: input.whatsappOptIn,
      }),
    })
    .where(eq(schema.customers.id, customer.id));

  return { ok: true };
}
