import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const productStatus = pgEnum("product_status", [
  "draft",
  "active",
  "archived",
]);

export const orderPaymentStatus = pgEnum("order_payment_status", [
  "pending",
  "paid",
  "failed",
  "refunded",
  "partially_refunded",
]);

export const orderFulfillmentStatus = pgEnum("order_fulfillment_status", [
  "pending",
  "processing",
  "shipped",
  "out_for_delivery",
  "delivered",
  "cancelled",
  "returned",
]);

export const returnStatus = pgEnum("return_status", [
  "requested",
  "approved",
  "rejected",
  "picked",
  "in_transit_to_seller",
  "received",
  "qc_failed",
  "refunded",
  "exchange_shipped",
  "exchange_delivered",
]);

// Split "return vs exchange" onto a dedicated column so it doesn't have to be
// inferred from reason-text prefixes anymore.
export const returnType = pgEnum("return_type", ["return", "exchange"]);

// Set at status='received' when admin inspects the returned/exchanged piece.
// A "fail" can still carry a partial refund — qcOutcome and refundAmount are
// independent columns, not mutually exclusive with a completed refund.
export const returnQcOutcome = pgEnum("return_qc_outcome", ["pass", "fail"]);

export const reviewStatus = pgEnum("review_status", [
  "pending",
  "approved",
  "rejected",
]);

export const couponType = pgEnum("coupon_type", ["flat", "percent"]);

export const adminRole = pgEnum("admin_role", ["owner", "manager", "staff"]);

export const movementReason = pgEnum("movement_reason", [
  "purchase",
  "sale",
  "return",
  "adjustment",
  "manual",
]);

export const messageChannel = pgEnum("message_channel", ["email", "whatsapp"]);
export const messageStatus = pgEnum("message_status", [
  "queued",
  "sent",
  "delivered",
  "read",
  "failed",
]);

export const categories = pgTable("categories", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  slug: varchar("slug", { length: 140 }).notNull().unique(),
  parentId: uuid("parent_id").references((): AnyPgColumn => categories.id),
  sortOrder: integer("sort_order").default(0).notNull(),
  // Homepage "wardrobe paths" tile image. Nullable — categories without one
  // fall back to the existing cloth-window placeholder gradient.
  imageUrl: text("image_url"),
  imageMobileUrl: text("image_mobile_url"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const banners = pgTable("banners", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: varchar("title", { length: 200 }),
  subtitle: varchar("subtitle", { length: 300 }),
  imageUrl: text("image_url").notNull(),
  mobileImageUrl: text("mobile_image_url"),
  ctaLabel: varchar("cta_label", { length: 60 }),
  ctaHref: varchar("cta_href", { length: 300 }),
  isActive: boolean("is_active").default(true).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const homepageVideoPosition = pgEnum("homepage_video_position", [
  "left",
  "right",
]);

// The "made to live in" homepage section — always exactly two fixed video
// slots (left/right), unlike `banners` which is an arbitrary-length rotating
// carousel. Kept as its own small table rather than shoehorned into banners
// so the fixed two-up layout has a purpose-built shape (position is unique,
// so there are only ever at most 2 rows).
export const homepageVideoSlots = pgTable("homepage_video_slots", {
  id: uuid("id").defaultRandom().primaryKey(),
  position: homepageVideoPosition("position").notNull().unique(),
  videoUrl: text("video_url"),
  title: varchar("title", { length: 200 }),
  subtitle: varchar("subtitle", { length: 300 }),
  ctaLabel: varchar("cta_label", { length: 60 }),
  ctaHref: varchar("cta_href", { length: 300 }),
  isActive: boolean("is_active").default(true).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const collections = pgTable("collections", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 140 }).notNull(),
  slug: varchar("slug", { length: 160 }).notNull().unique(),
  description: text("description"),
  heroImageUrl: text("hero_image_url"),
  isActive: boolean("is_active").default(true).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  // Admin-picked "show this on the homepage" flag. At most one collection
  // can have this set — enforced by a partial unique index (see
  // scripts/apply-p1-unblockers-schema.ts), not a DB-level constraint
  // Drizzle can express declaratively.
  isHomepageFeature: boolean("is_homepage_feature").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const products = pgTable(
  "products",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    title: varchar("title", { length: 200 }).notNull(),
    slug: varchar("slug", { length: 220 }).notNull().unique(),
    // Short human code (e.g. "DR001") derived from category + a per-category
    // sequence, generated once at creation. Nullable so pre-existing rows
    // don't need a backfill; createVariant() backfills it lazily on first use.
    styleCode: varchar("style_code", { length: 20 }).unique(),
    description: text("description"),
    fabric: varchar("fabric", { length: 120 }),
    washCare: text("wash_care"),
    basePrice: integer("base_price").notNull(),
    mrp: integer("mrp"),
    status: productStatus("status").default("draft").notNull(),
    categoryId: uuid("category_id").references(() => categories.id),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    // Every /shop/[category] page load filters on this.
    categoryIdx: index("product_category_id_idx").on(t.categoryId),
  }),
);

export const productVariants = pgTable(
  "product_variants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    size: varchar("size", { length: 20 }),
    color: varchar("color", { length: 60 }),
    sku: varchar("sku", { length: 80 }).notNull().unique(),
    price: integer("price").notNull(),
    stock: integer("stock").default(0).notNull(),
    weightGrams: integer("weight_grams"),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    productSizeColor: uniqueIndex("variant_product_size_color_idx").on(
      t.productId,
      t.size,
      t.color,
    ),
  }),
);

export const productImages = pgTable(
  "product_images",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    variantColor: varchar("variant_color", { length: 60 }),
    url: text("url").notNull(),
    altText: varchar("alt_text", { length: 220 }),
    sortOrder: integer("sort_order").default(0).notNull(),
  },
  (t) => ({
    // Every PDP load fetches a product's gallery by productId.
    productIdx: index("product_image_product_id_idx").on(t.productId),
  }),
);

export const collectionProducts = pgTable(
  "collection_products",
  {
    collectionId: uuid("collection_id")
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").default(0).notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.collectionId, t.productId] }),
  }),
);

export const customers = pgTable("customers", {
  id: uuid("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  phone: varchar("phone", { length: 20 }),
  fullName: varchar("full_name", { length: 160 }),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  whatsappOptIn: boolean("whatsapp_opt_in").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const addresses = pgTable(
  "addresses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    fullName: varchar("full_name", { length: 160 }).notNull(),
    phone: varchar("phone", { length: 20 }).notNull(),
    line1: varchar("line1", { length: 200 }).notNull(),
    line2: varchar("line2", { length: 200 }),
    city: varchar("city", { length: 100 }).notNull(),
    state: varchar("state", { length: 100 }).notNull(),
    pincode: varchar("pincode", { length: 10 }).notNull(),
    isDefault: boolean("is_default").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    // Every account-address read/write filters by customerId.
    customerIdx: index("address_customer_id_idx").on(t.customerId),
  }),
);

export const carts = pgTable(
  "carts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    customerId: uuid("customer_id").references(() => customers.id, {
      onDelete: "cascade",
    }),
    guestToken: varchar("guest_token", { length: 64 }).unique(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    // Partial — guest carts have a null customerId and are deliberately not
    // covered (only guestToken's own unique constraint applies there). This
    // caps a signed-in customer at one cart row, closing a race where two
    // concurrent first-time cart operations (two tabs, phone+laptop) could
    // both find no existing cart and both insert one. See
    // resolveOrCreateCartId in lib/actions/cart.ts for the paired
    // ON CONFLICT DO NOTHING + re-select.
    customerUnique: uniqueIndex("cart_customer_id_idx")
      .on(t.customerId)
      .where(sql`${t.customerId} IS NOT NULL`),
  }),
);

export const cartItems = pgTable(
  "cart_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    cartId: uuid("cart_id")
      .notNull()
      .references(() => carts.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull(),
    addedAt: timestamp("added_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    cartVariant: uniqueIndex("cart_item_cart_variant_idx").on(
      t.cartId,
      t.variantId,
    ),
  }),
);

export const coupons = pgTable("coupons", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: varchar("code", { length: 40 }).notNull().unique(),
  type: couponType("type").notNull(),
  value: integer("value").notNull(),
  minOrderAmount: integer("min_order_amount").default(0).notNull(),
  usageLimit: integer("usage_limit"),
  perCustomerLimit: integer("per_customer_limit").default(1).notNull(),
  usedCount: integer("used_count").default(0).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderNumber: varchar("order_number", { length: 30 }).notNull().unique(),
    customerId: uuid("customer_id").references(() => customers.id),
    email: varchar("email", { length: 255 }).notNull(),
    phone: varchar("phone", { length: 20 }).notNull(),
    whatsappOptIn: boolean("whatsapp_opt_in").default(false).notNull(),
    shippingAddress: jsonb("shipping_address").notNull(),
    billingAddress: jsonb("billing_address"),
    subtotal: integer("subtotal").notNull(),
    discount: integer("discount").default(0).notNull(),
    shippingFee: integer("shipping_fee").default(0).notNull(),
    total: integer("total").notNull(),
    couponCode: varchar("coupon_code", { length: 40 }),
    // Buyer's GSTIN, optional — only business customers who want it on the tax
    // invoice provide one. Format-validated at checkout (lib/gst.ts).
    gstNumber: varchar("gst_number", { length: 15 }),
    paymentStatus: orderPaymentStatus("payment_status")
      .default("pending")
      .notNull(),
    fulfillmentStatus: orderFulfillmentStatus("fulfillment_status")
      .default("pending")
      .notNull(),
    // True only for orders whose stock was actually decremented at checkout
    // (initCheckout's atomic reservation). Defaults false so every order that
    // predates this column — created back when checkout only checked stock
    // without reserving it — is correctly never touched by the stock-restore
    // path in releaseExpiredCheckoutHolds / markOrderPaymentFailed. Without
    // this, restoring stock for a pre-existing pending order would "give back"
    // a unit that was never actually taken, silently inflating that variant's
    // real stock count.
    stockReserved: boolean("stock_reserved").default(false).notNull(),
    invoiceNumber: varchar("invoice_number", { length: 30 }).unique(),
    razorpayOrderId: varchar("razorpay_order_id", { length: 60 }).unique(),
    razorpayPaymentId: varchar("razorpay_payment_id", { length: 60 }),
    awbNumber: varchar("awb_number", { length: 60 }),
    delhiveryOrderId: varchar("delhivery_order_id", { length: 60 }),
    notes: text("notes"),
    placedAt: timestamp("placed_at", { withTimezone: true }),
    // Set once, when fulfillmentStatus transitions to "delivered" (Delhivery
    // webhook or admin manual override) — the real source of truth for the
    // return window, replacing the old `updatedAt` proxy (any order edit bumps
    // updatedAt, not just delivery, so it could silently stretch or shrink the
    // customer's return window).
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    // Customer's own order-history page — every order belongs to a
    // customer now that guest checkout is gone (customerId is nullable in
    // the type only for legacy pre-#116 rows).
    customerCreatedIdx: index("order_customer_created_idx").on(
      t.customerId,
      t.createdAt.desc(),
    ),
  }),
);

export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id),
    productTitleSnapshot: varchar("product_title_snapshot", { length: 220 })
      .notNull(),
    variantLabelSnapshot: varchar("variant_label_snapshot", { length: 120 }),
    skuSnapshot: varchar("sku_snapshot", { length: 80 }).notNull(),
    unitPriceSnapshot: integer("unit_price_snapshot").notNull(),
    quantity: integer("quantity").notNull(),
    lineTotal: integer("line_total").notNull(),
  },
  (t) => ({
    // Order detail, invoice generation, and the GST report's per-line query
    // all fetch order_items by orderId — Postgres doesn't auto-index a FK
    // on the referencing side.
    orderIdx: index("order_item_order_id_idx").on(t.orderId),
  }),
);

export const reviews = pgTable(
  "reviews",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    rating: integer("rating").notNull(),
    body: text("body"),
    status: reviewStatus("status").default("pending").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    // One review per customer per product — submitReview() upserts on this
    // (see lib/actions/reviews.ts) instead of a check-then-insert, so a
    // double-click/flaky retry can't create two rows and double-count in
    // the average rating.
    productCustomerUnique: uniqueIndex("review_product_customer_idx").on(
      t.productId,
      t.customerId,
    ),
    // getApprovedReviews(productId) runs on every PDP load, unauthenticated.
    productStatusIdx: index("review_product_status_idx").on(
      t.productId,
      t.status,
    ),
  }),
);

export const wishlists = pgTable(
  "wishlists",
  {
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "cascade" }),
    addedAt: timestamp("added_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.customerId, t.variantId] }),
  }),
);

export const returns = pgTable(
  "returns",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderItemId: uuid("order_item_id")
      .notNull()
      .references(() => orderItems.id, { onDelete: "cascade" }),
    reason: varchar("reason", { length: 200 }).notNull(),
    reasonCategory: varchar("reason_category", { length: 60 }),
    status: returnStatus("status").default("requested").notNull(),
    // "return" | "exchange" — replaces the old convention of prefixing `reason`
    // with "Exchange requested." to fake a type (see lib/exchange.ts history).
    type: returnType("type").default("return").notNull(),
    // Exchange target — which variant the customer wants instead. Null for
    // plain returns, and null for exchanges until the customer picks one via
    // ExchangeVariantChooser (PR 2). set null on delete: losing the specific
    // variant shouldn't block resolving an otherwise-valid request.
    desiredVariantId: uuid("desired_variant_id").references(
      () => productVariants.id,
      { onDelete: "set null" },
    ),
    // Customer-submitted evidence photos (damage, wrong item, etc.) — Cloudinary
    // URLs, 0-3 per request. See components/storefront/return-photo-uploader.tsx.
    photos: jsonb("photos").$type<string[]>().default(sql`'[]'::jsonb`).notNull(),
    refundAmount: integer("refund_amount"),
    razorpayRefundId: varchar("razorpay_refund_id", { length: 60 }),
    // Reverse pickup AWB (studio ← customer) — pre-existing column, covers what
    // would otherwise be a duplicate "reverseAwb".
    delhiveryReversePickupId: varchar("delhivery_reverse_pickup_id", {
      length: 60,
    }),
    // Outbound swap shipment AWB (exchange only) — distinct from
    // delhiveryReversePickupId, which tracks the *original* piece coming back.
    outboundAwb: varchar("outbound_awb", { length: 60 }),
    // Structured reason code from ReturnRejectPicker's REJECT_REASONS (e.g.
    // "window_expired") — a plain varchar like reasonCategory above, not a DB
    // enum, so the admin-facing reason list can grow without a migration.
    rejectionReason: varchar("rejection_reason", { length: 60 }),
    // Free-text note visible to the customer — populated from either the
    // reject picker's "other" note or the QC panel's fail note (the two are
    // mutually exclusive: a rejected request never reaches QC, and vice versa).
    adminNote: text("admin_note"),
    qcOutcome: returnQcOutcome("qc_outcome"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => ({
    // One return request per order item — requestReturn() (lib/actions/
    // account.ts) does a check-then-insert; without this, two near-
    // simultaneous requests for the same item could both pass the check and
    // insert two independently-refundable rows. Plain (non-partial): both
    // requestReturn() and getReturnableItems() already treat ANY existing
    // return row — regardless of status — as blocking a new request, so
    // there's no "rejected returns can be re-requested" case to carve out.
    orderItemUnique: uniqueIndex("return_order_item_idx").on(t.orderItemId),
  }),
);

export const inventoryMovements = pgTable("inventory_movements", {
  id: serial("id").primaryKey(),
  variantId: uuid("variant_id")
    .notNull()
    .references(() => productVariants.id, { onDelete: "cascade" }),
  delta: integer("delta").notNull(),
  reason: movementReason("reason").notNull(),
  referenceId: varchar("reference_id", { length: 80 }),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const admins = pgTable("admins", {
  id: uuid("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  fullName: varchar("full_name", { length: 160 }),
  role: adminRole("role").default("staff").notNull(),
  totpSecret: text("totp_secret"),
  totpEnabled: boolean("totp_enabled").default(false).notNull(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/**
 * Records every meaningful admin write (create/update/delete/status-change)
 * for accountability — "who changed what" once there's more than one admin,
 * or for dispute resolution. Logged from lib/audit/log-admin-action.ts,
 * called at the end of each mutating action after it succeeds (never
 * blocks the actual action if logging itself fails — see that file).
 */
export const adminAuditLog = pgTable("admin_audit_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  adminId: uuid("admin_id")
    .notNull()
    .references(() => admins.id),
  // e.g. "product.create", "order.fulfillment_status_update"
  action: varchar("action", { length: 80 }).notNull(),
  entityType: varchar("entity_type", { length: 60 }).notNull(),
  entityId: varchar("entity_id", { length: 120 }),
  // Free-form context: previous/new values for an update, the deleted
  // row's identifying fields for a delete, etc. — whatever's useful to
  // reconstruct what happened without needing the entity to still exist.
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const messageLog = pgTable("message_log", {
  id: serial("id").primaryKey(),
  channel: messageChannel("channel").notNull(),
  toAddress: varchar("to_address", { length: 255 }).notNull(),
  templateKey: varchar("template_key", { length: 80 }).notNull(),
  status: messageStatus("status").default("queued").notNull(),
  providerMessageId: varchar("provider_message_id", { length: 120 }),
  payload: jsonb("payload"),
  errorMessage: text("error_message"),
  orderId: uuid("order_id").references(() => orders.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/**
 * Backs the Postgres-based rate limiter (lib/security/rate-limit.ts). Fixed-
 * window counting: one row per (rateKey, windowStart) — checking a key
 * upserts+increments its current window's row. Using Postgres instead of an
 * in-memory counter is deliberate: Vercel functions are ephemeral and scale
 * across many instances, so an in-memory Map wouldn't coordinate attempts
 * across them (each cold start / instance would get its own counter,
 * effectively multiplying the real limit by however many instances handle
 * a burst). This table is the single shared source of truth instead.
 */
export const rateLimitAttempts = pgTable(
  "rate_limit_attempts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    rateKey: varchar("rate_key", { length: 200 }).notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").default(1).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    keyWindow: uniqueIndex("rate_limit_key_window_idx").on(t.rateKey, t.windowStart),
  }),
);

export const updatedAtTrigger = sql`
  CREATE OR REPLACE FUNCTION set_updated_at()
  RETURNS TRIGGER AS $$
  BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;
`;
