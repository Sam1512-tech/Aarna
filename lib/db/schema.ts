import { sql } from "drizzle-orm";
import {
  boolean,
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
  "received",
  "refunded",
]);

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
  parentId: uuid("parent_id"),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
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
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const products = pgTable("products", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: varchar("title", { length: 200 }).notNull(),
  slug: varchar("slug", { length: 220 }).notNull().unique(),
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
});

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

export const productImages = pgTable("product_images", {
  id: uuid("id").defaultRandom().primaryKey(),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  variantColor: varchar("variant_color", { length: 60 }),
  url: text("url").notNull(),
  altText: varchar("alt_text", { length: 220 }),
  sortOrder: integer("sort_order").default(0).notNull(),
});

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

export const addresses = pgTable("addresses", {
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
});

export const carts = pgTable("carts", {
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
});

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

export const orders = pgTable("orders", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderNumber: varchar("order_number", { length: 30 }).notNull().unique(),
  customerId: uuid("customer_id").references(() => customers.id),
  email: varchar("email", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 20 }).notNull(),
  shippingAddress: jsonb("shipping_address").notNull(),
  billingAddress: jsonb("billing_address"),
  subtotal: integer("subtotal").notNull(),
  discount: integer("discount").default(0).notNull(),
  shippingFee: integer("shipping_fee").default(0).notNull(),
  total: integer("total").notNull(),
  couponCode: varchar("coupon_code", { length: 40 }),
  paymentStatus: orderPaymentStatus("payment_status")
    .default("pending")
    .notNull(),
  fulfillmentStatus: orderFulfillmentStatus("fulfillment_status")
    .default("pending")
    .notNull(),
  invoiceNumber: varchar("invoice_number", { length: 30 }).unique(),
  razorpayOrderId: varchar("razorpay_order_id", { length: 60 }).unique(),
  razorpayPaymentId: varchar("razorpay_payment_id", { length: 60 }),
  awbNumber: varchar("awb_number", { length: 60 }),
  delhiveryOrderId: varchar("delhivery_order_id", { length: 60 }),
  notes: text("notes"),
  placedAt: timestamp("placed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const orderItems = pgTable("order_items", {
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
});

export const reviews = pgTable("reviews", {
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
});

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

export const returns = pgTable("returns", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderItemId: uuid("order_item_id")
    .notNull()
    .references(() => orderItems.id, { onDelete: "cascade" }),
  reason: varchar("reason", { length: 200 }).notNull(),
  reasonCategory: varchar("reason_category", { length: 60 }),
  status: returnStatus("status").default("requested").notNull(),
  refundAmount: integer("refund_amount"),
  razorpayRefundId: varchar("razorpay_refund_id", { length: 60 }),
  shiprocketReversePickupId: varchar("shiprocket_reverse_pickup_id", {
    length: 60,
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

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

export const updatedAtTrigger = sql`
  CREATE OR REPLACE FUNCTION set_updated_at()
  RETURNS TRIGGER AS $$
  BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;
`;
