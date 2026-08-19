import { and, eq, inArray, isNotNull, lt, ne, sql } from "drizzle-orm";
import { after } from "next/server";
import { db, schema } from "@/lib/db";
import type { GstLineResult, GstRateBreakdown, InvoiceData } from "@/lib/invoice/generate";
import {
  calculateOrderGst,
  creditNoteSequenceName,
  currentFinancialYear,
  invoiceSequenceName,
  isInterStateOrder,
} from "@/lib/invoice/generate";
import { applyStockMovement } from "@/lib/db/queries/inventory";
import { fetchRazorpayOrderStatus } from "@/lib/razorpay";
import { alertAdminSuspiciousActivity } from "@/lib/security/alert-admin";
import { mapDelhiveryStatus, trackShipment } from "@/lib/delhivery";
import { canTransitionFulfillment } from "@/lib/orders/fulfillment-transitions";
import { notifyWhatsApp, firstNameFromAddress } from "@/lib/whatsapp/notify";

const {
  orders,
  orderItems,
  returns,
  carts,
  cartItems,
  messageLog,
  coupons,
  orderRefundEvents,
  creditNotes,
} = schema;

/** How long a checkout attempt holds its reserved stock before it's treated
 * as abandoned and released back — see releaseExpiredCheckoutHolds. */
export const CHECKOUT_HOLD_MINUTES = 20;

export type OrderRow = typeof orders.$inferSelect;
export type OrderItemRow = typeof orderItems.$inferSelect;
export type OrderWithItems = OrderRow & { orderItems: OrderItemRow[] };

export async function getOrderByRazorpayId(
  razorpayOrderId: string,
): Promise<OrderWithItems | null> {
  const order = await db
    .select()
    .from(orders)
    .where(eq(orders.razorpayOrderId, razorpayOrderId))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!order) return null;

  const items = await db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, order.id));

  return { ...order, orderItems: items };
}

/**
 * Same shape as getOrderByRazorpayId, keyed by our own id instead — needed
 * for COD orders, which never get a razorpayOrderId (initCheckout skips
 * Razorpay entirely for them) and so have no other way to re-fetch the
 * freshly-created row + its items for buildInvoiceData.
 */
export async function getOrderById(orderId: string): Promise<OrderWithItems | null> {
  const order = await db
    .select()
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!order) return null;

  const items = await db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, order.id));

  return { ...order, orderItems: items };
}

export type MarkOrderPaidResult =
  | { won: true; invoiceNumber: string; needsStockDecrement: boolean }
  | { won: false; invoiceNumber: null; needsStockDecrement: false };

/**
 * Creates the per-financial-year invoice sequence the first time it's
 * needed for that FY, bootstrapped to continue past the highest invoice
 * number already issued under that prefix rather than blindly starting at
 * 1. No-op (one cheap existence check, no locking) once the sequence
 * already exists — true for every call after the first one made for a
 * given FY, which is the overwhelming majority of calls in practice.
 *
 * This bootstrap is what makes the fix safe to deploy mid-year: before this
 * change every invoice number came off one single global `invoice_seq`, so
 * real orders can already carry numbers like "AL/26-27/00004" for the
 * CURRENT financial year at the exact moment `invoice_seq_26_27` is created
 * for the first time. A fresh sequence blindly starting at 1 would
 * immediately collide with the existing "AL/26-27/00001" row — a real
 * `orders_invoice_number_unique` violation this was caught by, live,
 * verifying the fix against the dev DB (see the PR description). Every
 * FUTURE financial year never hits this: by definition no order can carry
 * an "AL/<future-fy>/…" number before that FY starts, so `existingMax` is
 * always 0 there and the sequence legitimately starts at 1 — this same
 * function handles both cases without needing a separate one-off migration
 * per year.
 */
export async function ensureInvoiceSequence(
  sequenceName: string,
  invoicePrefix: string,
): Promise<void> {
  const [{ existed }] = (await db.execute(
    sql`SELECT to_regclass(${sequenceName}) IS NOT NULL AS existed`,
  )) as unknown as { existed: boolean }[];
  if (existed) return;

  await db.transaction(async (tx) => {
    // Advisory lock scoped to this transaction, keyed off the sequence
    // name — serializes two orders paying at the exact moment a brand-new
    // FY's sequence is first needed, so they can't both race the
    // create-then-bootstrap sequence below off a stale pre-lock read.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${sequenceName}))`);

    const [{ existed: existedAfterLock }] = (await tx.execute(
      sql`SELECT to_regclass(${sequenceName}) IS NOT NULL AS existed`,
    )) as unknown as { existed: boolean }[];
    if (existedAfterLock) return; // another concurrent call already won this

    await tx.execute(sql`CREATE SEQUENCE IF NOT EXISTS ${sql.raw(sequenceName)} START 1`);

    const [{ existingMax }] = (await tx.execute(
      sql`SELECT COALESCE(MAX(substring(invoice_number from '\\d+$')::int), 0) AS "existingMax"
          FROM orders WHERE invoice_number LIKE ${invoicePrefix + "%"}`,
    )) as unknown as { existingMax: number }[];

    if (existingMax > 0) {
      await tx.execute(sql`SELECT setval(${sequenceName}, ${existingMax}, true)`);
    }
  });
}

/**
 * Same lazy-bootstrap pattern as ensureInvoiceSequence above, scoped to
 * credit_notes.credit_note_number instead of orders.invoice_number — credit
 * notes are a distinct GST document type with their own sequence per
 * financial year (see creditNoteSequenceName/formatCreditNoteNumber in
 * lib/invoice/generate.ts).
 */
async function ensureCreditNoteSequence(
  sequenceName: string,
  creditNotePrefix: string,
): Promise<void> {
  const [{ existed }] = (await db.execute(
    sql`SELECT to_regclass(${sequenceName}) IS NOT NULL AS existed`,
  )) as unknown as { existed: boolean }[];
  if (existed) return;

  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${sequenceName}))`);

    const [{ existed: existedAfterLock }] = (await tx.execute(
      sql`SELECT to_regclass(${sequenceName}) IS NOT NULL AS existed`,
    )) as unknown as { existed: boolean }[];
    if (existedAfterLock) return;

    await tx.execute(sql`CREATE SEQUENCE IF NOT EXISTS ${sql.raw(sequenceName)} START 1`);

    const [{ existingMax }] = (await tx.execute(
      sql`SELECT COALESCE(MAX(substring(credit_note_number from '\\d+$')::int), 0) AS "existingMax"
          FROM credit_notes WHERE credit_note_number LIKE ${creditNotePrefix + "%"}`,
    )) as unknown as { existingMax: number }[];

    if (existingMax > 0) {
      await tx.execute(sql`SELECT setval(${sequenceName}, ${existingMax}, true)`);
    }
  });
}

/**
 * Marks an order paid. Guarded to only fire from `pending` or `failed` — NOT
 * a blanket `paymentStatus <> 'paid'` — so that two concurrent
 * `payment.captured` deliveries for the same order (Razorpay documents
 * at-least-once webhook delivery) can't both win: only the first write
 * lands, the second updates zero rows. `failed` is deliberately included
 * (not just `pending`): a capture can legitimately arrive after
 * `releaseExpiredCheckoutHolds` or an earlier `payment.failed` already
 * flipped the order to `failed`. `refunded`/`partially_refunded` are
 * deliberately EXCLUDED — those only exist after a real prior payment (see
 * `recordRefund`), so a replayed/redelivered `payment.captured` for one of
 * them must never resurrect it back to `paid`, overwrite its invoice number,
 * or reset `placedAt` (which the GST sales register keys off of).
 *
 * The invoice number is generated INSIDE this same guarded UPDATE (Postgres
 * only evaluates a `SET` expression for rows the `WHERE` clause actually
 * matches) rather than pulled beforehand — pulling it first would still let
 * a losing delivery burn a real, permanent value off the shared sequence
 * for a write that never lands, leaving an unexplained gap in the
 * financial-year invoice sequence.
 *
 * The sequence itself is scoped per financial year (`invoiceSequenceName`)
 * — created lazily here on first use each FY via `ensureInvoiceSequence`,
 * not via a one-off migration script, since the sequence name is only known
 * at call time. This is what makes the count actually restart at 00001
 * every April rather than continuing to climb across financial years
 * forever.
 *
 * Returns whether this call was the one that actually transitioned the
 * order — the caller uses that to decide whether to run the paid-order side
 * effects (invoice, stock, coupon count, notifications) at all.
 */
export async function markOrderPaid(
  orderId: string,
  razorpayPaymentId: string,
): Promise<MarkOrderPaidResult> {
  const financialYear = currentFinancialYear();
  const sequenceName = invoiceSequenceName(financialYear);
  const invoicePrefix = `AL/${financialYear}/`;

  await ensureInvoiceSequence(sequenceName, invoicePrefix);

  return db.transaction(async (tx) => {
    // Lock the row and read its CURRENT paymentStatus/stockReserved before
    // deciding anything — this must not be a value the caller read earlier
    // and handed in, or read-then-write races against
    // releaseExpiredCheckoutHolds (which flips a stale order to "failed"
    // and restocks +1, but never touches stockReserved itself). A caller
    // that computed "does this order still need its stock decremented"
    // from a snapshot taken before this transaction started could compute
    // the wrong answer if a release lands in between: the webhook would
    // then believe stock is still reserved when it's actually just been
    // given back, and the +1 restock is never taken back — a real,
    // undetected oversold unit. Locking here and re-deriving the decision
    // from the locked read closes that: any concurrent
    // releaseExpiredCheckoutHolds on this exact order either already
    // committed (so this read sees its result) or blocks until this
    // transaction is done (so it can't land in the middle).
    const [current] = await tx
      .select({
        paymentStatus: orders.paymentStatus,
        stockReserved: orders.stockReserved,
      })
      .from(orders)
      .where(eq(orders.id, orderId))
      .for("update");

    if (!current || !["pending", "failed"].includes(current.paymentStatus)) {
      return { won: false, invoiceNumber: null, needsStockDecrement: false };
    }

    // Same logic the caller used to compute inline, now derived from the
    // locked, guaranteed-current read instead of a pre-transaction snapshot.
    const needsStockDecrement =
      !current.stockReserved || current.paymentStatus === "failed";

    const updated = await tx
      .update(orders)
      .set({
        invoiceNumber: sql`${invoicePrefix} || lpad(nextval('${sql.raw(sequenceName)}')::text, 5, '0')`,
        razorpayPaymentId,
        paymentStatus: "paid",
        fulfillmentStatus: "processing",
        placedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(orders.id, orderId), inArray(orders.paymentStatus, ["pending", "failed"])))
      .returning({ id: orders.id, invoiceNumber: orders.invoiceNumber });

    if (updated.length === 0 || !updated[0].invoiceNumber) {
      return { won: false, invoiceNumber: null, needsStockDecrement: false };
    }
    return {
      won: true,
      invoiceNumber: updated[0].invoiceNumber,
      needsStockDecrement,
    };
  });
}

/**
 * Atomically bumps a coupon's redemption counter, refusing to cross its own
 * usage limit — `WHERE usedCount < usageLimit` makes the check-and-increment
 * a single statement, closing the race where two simultaneous checkouts both
 * read a stale `usedCount` and both redeem a one-time coupon. Called from the
 * `payment.captured` webhook (once payment is actually confirmed, guarded by
 * the same `markOrderPaid` idempotency check) rather than at order-creation
 * time, so a coupon's budget is only spent by checkouts that actually paid —
 * an abandoned or repeatedly-retried checkout no longer exhausts it.
 *
 * Returns false if the limit was already reached by other concurrent paid
 * orders. That race is real and not narrow: because the counter is no
 * longer touched at order-creation time, `applyCoupon`'s own limit check
 * (lib/actions/cart.ts) stays "not yet reached" for every order created
 * before ANY of them finishes paying — a window that spans the whole
 * checkout-to-payment-capture latency, up to CHECKOUT_HOLD_MINUTES for an
 * order that sits pending the whole time. For a heavily-publicized
 * usageLimit=1 coupon, more than two customers could plausibly all pass
 * validation and all pay before the first one's webhook lands. This is a
 * deliberate tradeoff, not an oversight: by design this function never
 * blocks or reverses an already-captured payment, it only stops the counter
 * itself from over-counting — the discount was already honored on each such
 * order's own total and invoice at checkout time. A hard pre-payment
 * reservation (mirroring the stock row-lock in initCheckout) would close
 * this properly if a coupon's exact redemption count ever needs to be a
 * hard cap rather than a best-effort one.
 */
export async function incrementCouponUsage(couponCode: string): Promise<boolean> {
  const updated = await db
    .update(coupons)
    .set({ usedCount: sql`${coupons.usedCount} + 1` })
    .where(
      and(
        eq(coupons.code, couponCode),
        sql`(${coupons.usageLimit} IS NULL OR ${coupons.usedCount} < ${coupons.usageLimit})`,
      ),
    )
    .returning({ id: coupons.id });
  return updated.length > 0;
}

/**
 * Detects (after the fact — never blocks) whether a customer's paid orders
 * against one coupon now exceed its perCustomerLimit. applyCoupon's own
 * pre-payment check (lib/actions/cart.ts) only sees redemptions that have
 * ALREADY landed as paid, so it closes the sequential-reuse case (apply,
 * pay, try again later) but is genuinely TOCTOU-racy against two
 * concurrent checkouts for the same customer+coupon: both can see 0 prior
 * paid redemptions and both go on to pay, exactly mirroring the same class
 * of race incrementCouponUsage (above) closes for the coupon's GLOBAL
 * usageLimit — same fix shape applied to a per-customer count instead of a
 * simple counter column.
 *
 * A Postgres advisory lock keyed on (customerId, couponCode) serializes
 * concurrent calls for the same customer+coupon pair so the count below
 * can't itself race: the first payment.captured to reach this function for
 * a given customer+coupon sees count=1 (itself) and passes; if a second,
 * concurrently-paid order for the same customer+coupon reaches this
 * function next, the lock makes it wait for the first to finish, then it
 * counts BOTH now-paid orders and correctly detects the overage.
 *
 * Deliberately never blocks or reverses an already-captured payment — by
 * the time this runs the customer has already paid and the discount was
 * already honored on that order's own total/invoice at checkout time.
 * Returns whether the customer is now over their per-order limit, so the
 * caller can alert an admin the same way incrementCouponUsage's caller
 * does for the global limit.
 */
export async function checkCouponPerCustomerOverage(
  customerId: string,
  couponCode: string,
): Promise<{ overLimit: boolean; timesUsed: number; limit: number } | null> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${customerId + ":" + couponCode}))`,
    );

    const [coupon] = await tx
      .select({ perCustomerLimit: coupons.perCustomerLimit })
      .from(coupons)
      .where(eq(coupons.code, couponCode))
      .limit(1);
    if (!coupon) return null;

    const [{ count }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(orders)
      .where(
        and(
          eq(orders.customerId, customerId),
          eq(orders.couponCode, couponCode),
          inArray(orders.paymentStatus, ["paid", "partially_refunded", "refunded"]),
        ),
      );

    return {
      overLimit: count > coupon.perCustomerLimit,
      timesUsed: count,
      limit: coupon.perCustomerLimit,
    };
  });
}

/**
 * Remove the purchased variants from the customer's cart. Checkout snapshots
 * the cart into order_items but never empties it, so without this the bag
 * (and the header count badge) keeps showing the items after a successful
 * payment. Only the ordered variants are removed — anything the customer
 * added between initiating checkout and the webhook firing stays in the bag.
 */
export async function clearPurchasedCartItems(order: OrderWithItems) {
  if (!order.customerId) return;
  const variantIds = order.orderItems.map((item) => item.variantId);
  if (variantIds.length === 0) return;

  const cart = await db
    .select({ id: carts.id })
    .from(carts)
    .where(eq(carts.customerId, order.customerId))
    .limit(1)
    .then((rows) => rows[0] ?? null);
  if (!cart) return;

  await db
    .delete(cartItems)
    .where(
      and(
        eq(cartItems.cartId, cart.id),
        inArray(cartItems.variantId, variantIds),
      ),
    );
}

/**
 * Marks a still-pending order as failed and releases the stock initCheckout
 * reserved for it. No-op if the order was already paid (a late
 * payment.failed event must never override a successful capture) or already
 * failed (e.g. released earlier by releaseExpiredCheckoutHolds — the WHERE
 * clause only ever matches a row still "pending", so this can never
 * double-restore stock for the same order). Returns true if a row was
 * actually updated.
 *
 * Only restores stock when stock_reserved is true — an order created before
 * this column existed never actually had its stock decremented at checkout
 * (the old logic only checked stock, never reserved it), so "restoring" it
 * would incorrectly inflate that variant's real stock count.
 */
export async function markOrderPaymentFailed(
  razorpayOrderId: string,
): Promise<boolean> {
  const updated = await db
    .update(orders)
    .set({ paymentStatus: "failed", updatedAt: new Date() })
    .where(
      and(
        eq(orders.razorpayOrderId, razorpayOrderId),
        eq(orders.paymentStatus, "pending"),
      ),
    )
    .returning({
      id: orders.id,
      orderNumber: orders.orderNumber,
      stockReserved: orders.stockReserved,
    });

  if (updated.length === 0) return false;

  const { id, orderNumber, stockReserved } = updated[0];
  if (stockReserved) {
    const items = await db
      .select({ variantId: orderItems.variantId, quantity: orderItems.quantity })
      .from(orderItems)
      .where(eq(orderItems.orderId, id));
    await applyStockMovement(items, 1, "return", orderNumber);
  }

  return true;
}

/**
 * Releases stock held by checkout attempts that started but never completed
 * payment within CHECKOUT_HOLD_MINUTES — closes the gap between "stock is
 * reserved the instant checkout begins" (see initCheckout) and "the customer
 * actually pays." A genuine decline is released immediately by
 * markOrderPaymentFailed via the payment.failed webhook; this is the
 * backstop for checkouts that got no webhook at all (closed tab before ever
 * submitting payment). Called opportunistically at the start of every
 * checkout attempt, plus as a daily backstop in the cleanup-orders cron —
 * deliberately NOT a dedicated frequent cron, since Vercel's Hobby plan cron
 * jobs run at most once a day.
 *
 * The UPDATE ... WHERE payment_status = 'pending' ... RETURNING atomically
 * claims each row (Postgres row-level locking), so two concurrent callers
 * (a real checkout's opportunistic call racing the daily cron) can never
 * both "win" the same order and double-restore its stock.
 *
 * Only restores stock for rows with stock_reserved = true. An order created
 * before that column existed never actually had its stock decremented at
 * checkout (the old logic only checked stock, never reserved it) — this was
 * caught live: an early version of this function restored stock for
 * pre-existing pending test orders and inflated real variant stock counts
 * in the dev DB, since those orders had nothing to give back.
 */
export async function releaseExpiredCheckoutHolds(
  holdMinutes = CHECKOUT_HOLD_MINUTES,
): Promise<number> {
  const cutoff = new Date(Date.now() - holdMinutes * 60 * 1000);

  const expired = await db
    .update(orders)
    .set({ paymentStatus: "failed", updatedAt: new Date() })
    .where(and(eq(orders.paymentStatus, "pending"), lt(orders.createdAt, cutoff)))
    .returning({
      id: orders.id,
      orderNumber: orders.orderNumber,
      stockReserved: orders.stockReserved,
    });

  if (expired.length === 0) return 0;

  const reservedOrders = expired.filter((o) => o.stockReserved);
  if (reservedOrders.length > 0) {
    const items = await db
      .select({
        orderId: orderItems.orderId,
        variantId: orderItems.variantId,
        quantity: orderItems.quantity,
      })
      .from(orderItems)
      .where(inArray(orderItems.orderId, reservedOrders.map((o) => o.id)));

    for (const order of reservedOrders) {
      const lines = items
        .filter((i) => i.orderId === order.id)
        .map((i) => ({ variantId: i.variantId, quantity: i.quantity }));
      if (lines.length > 0) {
        await applyStockMovement(lines, 1, "return", order.orderNumber);
      }
    }
  }

  return expired.length;
}

/**
 * Records a processed Razorpay refund:
 *  - flips the order to "refunded" (full) or "partially_refunded"
 *  - marks any return row carrying this refund id as "refunded"
 * Returns the order plus whether this refund event was already processed
 * (webhook retry), so the caller can avoid sending a duplicate refund email.
 * Null if no order matches the refunded payment.
 *
 * Guards against two races, the same class `markOrderPaid` and
 * `incrementCouponUsage` already close elsewhere in this file:
 *
 *  1. Razorpay documents at-least-once webhook delivery — two near-
 *     simultaneous `refund.processed` deliveries for the exact SAME refund
 *     must only apply its side effects (status flip, email) once. Deriving
 *     `isDuplicate` from a plain read of `order.paymentStatus` doesn't close
 *     this: both deliveries can read "not yet refunded" before either write
 *     lands. And unlike `markOrderPaid` (a single one-way transition), a
 *     plain "did paymentStatus change" check can't serve as the idempotency
 *     signal here either — a legitimate SECOND partial refund on an order
 *     that's already "partially_refunded" and stays "partially_refunded"
 *     after it (still short of the total) produces a no-op status UPDATE
 *     too, indistinguishable from a true duplicate by that signal alone.
 *  2. An order refunded across multiple SEPARATE partial refunds (the
 *     normal shape now that returns are processed per item) must reach
 *     "refunded" once the sum of every refund issued for the order covers
 *     order.total — not just whichever single event's amount is being
 *     evaluated right now. Nothing in the schema tracked a running total.
 *
 * Both are closed by `order_refund_events` (schema.ts): an append-only
 * ledger, one row per Razorpay refund id, unique on razorpayRefundId. All of
 * the below runs in one transaction:
 *   - the order row is locked (SELECT ... FOR UPDATE) so two DIFFERENT
 *     refund events landing concurrently for the same order (e.g. two
 *     items' QC passing back to back) can't both compute a stale cumulative
 *     sum and neither correctly flips it to "refunded";
 *   - the refund event is claimed via INSERT ... ON CONFLICT DO NOTHING
 *     keyed on razorpayRefundId — a redelivered webhook for the same event
 *     inserts nothing, so `isDuplicate` is derived from whether the INSERT
 *     actually landed a row, not from the earlier read;
 *   - the new paymentStatus is computed from SUM(amount_paise) across every
 *     event recorded for the order so far (including the one just
 *     inserted), not this single event's amount.
 */
/**
 * Creates order_refund_events the first time it's actually needed, if it
 * doesn't already exist. Mirrors ensureInvoiceSequence's lazy-creation
 * pattern in this same file (cheap existence check, no-op once it exists,
 * advisory-locked create on the rare miss) — this table is declared in
 * lib/db/schema.ts like any other, so the normal path is a one-off script
 * run once against the target DB before this ships, but a live
 * refund.processed webhook must never hard-fail with "relation does not
 * exist" just because that step was missed on whatever DB production
 * actually points at. Column/index shape must stay in sync with the
 * orderRefundEvents definition in schema.ts by hand, since this is a
 * fallback path, not the source of truth for the shape.
 */
async function ensureOrderRefundEventsTable(): Promise<void> {
  const [{ existed }] = (await db.execute(
    sql`SELECT to_regclass('order_refund_events') IS NOT NULL AS existed`,
  )) as unknown as { existed: boolean }[];
  if (existed) return;

  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('order_refund_events_create'))`);

    const [{ existed: existedAfterLock }] = (await tx.execute(
      sql`SELECT to_regclass('order_refund_events') IS NOT NULL AS existed`,
    )) as unknown as { existed: boolean }[];
    if (existedAfterLock) return;

    await tx.execute(sql`
      CREATE TABLE IF NOT EXISTS order_refund_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        razorpay_refund_id varchar(60),
        amount_paise integer NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await tx.execute(sql`
      CREATE INDEX IF NOT EXISTS order_refund_events_order_idx
        ON order_refund_events (order_id)
    `);
    // Partial — a manually-sent COD refund event legitimately has no
    // razorpayRefundId; see the schema.ts comment on this table for why.
    await tx.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS order_refund_event_razorpay_refund_id_idx
        ON order_refund_events (razorpay_refund_id)
        WHERE razorpay_refund_id IS NOT NULL
    `);
  });
}

export async function recordRefund(params: {
  razorpayPaymentId: string;
  razorpayRefundId: string;
  amountRefundedPaise: number;
}): Promise<{ order: OrderRow; isDuplicate: boolean } | null> {
  await ensureOrderRefundEventsTable();

  const result = await db.transaction(async (tx) => {
    const [order] = await tx
      .select()
      .from(orders)
      .where(eq(orders.razorpayPaymentId, params.razorpayPaymentId))
      .limit(1)
      .for("update");
    if (!order) return null;

    const claimed = await tx
      .insert(orderRefundEvents)
      .values({
        orderId: order.id,
        razorpayRefundId: params.razorpayRefundId,
        amountPaise: params.amountRefundedPaise,
      })
      .onConflictDoNothing({ target: orderRefundEvents.razorpayRefundId })
      .returning({ id: orderRefundEvents.id });

    if (claimed.length === 0) {
      // Same refund id already recorded — a redelivered webhook for an
      // event this function already processed. Order is returned as-is
      // (already reflects that event); no further writes, no email.
      return { order, isDuplicate: true };
    }

    const [{ total: cumulativeRefunded }] = await tx
      .select({
        total: sql<number>`coalesce(sum(${orderRefundEvents.amountPaise}), 0)::int`,
      })
      .from(orderRefundEvents)
      .where(eq(orderRefundEvents.orderId, order.id));

    // The comparison basis is deliberately the sum of order_items.lineTotal
    // (the raw, undiscounted unitPrice * quantity snapshotted at checkout),
    // NOT order.total. order.total = subtotal - discount + shippingFee, but
    // markReturnQc — the only real producer of a refund event in this
    // codebase — always computes each refund from the returned item's own
    // lineTotal alone: shipping is never refunded by anything, and the
    // coupon discount is never subtracted from any individual item's
    // refund. Comparing against order.total therefore gets both directions
    // wrong: an order under the free-shipping threshold can never reach
    // order.total via item refunds alone (permanently stuck at
    // "partially_refunded" even once every item is refunded — the exact bug
    // this function exists to fix), and a discounted order can cross
    // order.total before every item is actually refunded (a premature
    // "refunded" flip while a real item was never returned). Summing the
    // items' own lineTotal is the true ceiling every real refund event is
    // drawn from, so it's the only basis that can't be wrong in either
    // direction regardless of shipping or discount.
    const [{ total: refundableTotal }] = await tx
      .select({
        total: sql<number>`coalesce(sum(${orderItems.lineTotal}), 0)::int`,
      })
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id));

    const nextStatus: "refunded" | "partially_refunded" =
      cumulativeRefunded >= refundableTotal ? "refunded" : "partially_refunded";

    const [updatedOrder] = await tx
      .update(orders)
      .set({ paymentStatus: nextStatus, updatedAt: new Date() })
      .where(eq(orders.id, order.id))
      .returning();

    // Resolve the return that triggered this refund (idempotent — a return
    // row can only reach "refunded" once, guarded elsewhere by markReturnQc's
    // own row lock, but this stays defensive in case the return's own write
    // didn't land for some reason before this webhook arrived).
    await tx
      .update(returns)
      .set({ status: "refunded", resolvedAt: new Date() })
      .where(
        and(
          eq(returns.razorpayRefundId, params.razorpayRefundId),
          ne(returns.status, "refunded"),
        ),
      );

    return { order: updatedOrder ?? order, isDuplicate: false };
  });

  if (!result) return null;

  // ── Credit note (GST — Section 34, CGST Act) ────────────────────────────
  // Deliberately OUTSIDE the transaction above and wrapped in its own
  // try/catch — mirrors the payment.captured webhook's isolation of invoice
  // PDF/email generation from markOrderPaid's own critical transaction (see
  // that function's docstring). The order/return status flips above are the
  // money-critical writes that must never roll back once a real Razorpay
  // refund has happened; credit-note bookkeeping matters but must not be
  // able to take those down with it if generation hits e.g. a Supabase
  // pooler hiccup (a real, recurring failure mode in this project — see
  // CLAUDE.md's dev-environment gotchas).
  //
  // Deliberately attempted on every call (not gated on `!result.isDuplicate`)
  // and made idempotent on its own terms (an existence check plus
  // creditNotes.razorpayRefundId's UNIQUE constraint as a backstop) rather
  // than piggybacking on the orderRefundEvents claim above — that claim only
  // ever succeeds once per refund id, so gating on it would mean a
  // redelivered webhook could never retry a credit note that failed to
  // generate on an earlier attempt.
  try {
    await ensureCreditNoteForRefund(result.order, params);
  } catch (err) {
    console.error(
      `[recordRefund] credit note generation failed for refund ${params.razorpayRefundId} on order ${result.order.orderNumber}:`,
      err,
    );
    await alertAdminSuspiciousActivity({
      event: "Credit note generation failed after a real refund",
      detail: `Refund ${params.razorpayRefundId} on order ${result.order.orderNumber} (Rs.${(params.amountRefundedPaise / 100).toFixed(2)}) succeeded in Razorpay and the order/return status updated correctly, but generating its GST credit note failed. This will retry automatically if Razorpay redelivers this webhook; otherwise a credit note needs to be created by hand. Error: ${err instanceof Error ? err.message : String(err)}`,
    }).catch((alertErr) => {
      console.error("[recordRefund] failed to alert admin about credit note failure:", alertErr);
    });
  }

  return result;
}

/**
 * Generates the GST credit note for a single refund event — idempotent (a
 * no-op if one already exists for this razorpayRefundId) and intentionally
 * separate from recordRefund's own transaction, see that function's comment.
 *
 * GST attribution has two paths:
 *
 * - Precise: this refund's razorpayRefundId already matches a `returns` row
 *   (markReturnQc sets it synchronously, before Razorpay's webhook can
 *   possibly arrive — recordRefund's own row lock on `orders`, shared by
 *   markReturnQc's join-wide FOR UPDATE, is what guarantees that write has
 *   already committed by the time this runs; see the comment on
 *   markReturnQc's own lock acquisition). The credit note is attributed to
 *   the real order item and its real GST rate slab — computed from
 *   calculateOrderGst run across the WHOLE order with the order's real
 *   discount, then isolating that one item's own already-discount-adjusted
 *   line, never a fresh GST calculation on the raw refunded amount at
 *   discount=0 (that undercounted the discount and overstated the credit
 *   note's tax whenever the order had a coupon — see PR review history).
 *   markReturnQc refunds the item's raw, pre-discount lineTotal (its own
 *   comment: "the coupon discount is never subtracted from any individual
 *   item's refund"), which can exceed what that item's discounted,
 *   actually-invoiced share was taxed on — a credit note can never reverse
 *   more GST than was charged, so the item's real tax split is scaled by
 *   the refund's fraction of the item's raw price, capped at 1.
 * - Fallback: no return row to resolve the specific item from (a
 *   manual/dashboard refund — see AARNA-001067/AARNA-001138 in CLAUDE.md).
 *   Allocates proportionally across the order's own rateBreakdown, flagged
 *   needsReview so an accountant verifies by hand rather than trusting an
 *   estimate silently.
 *
 * Both paths reconcile their own rounding: independently Math.round()-ing
 * each GST bucket can leave the buckets' sum a paisa or two short of the
 * true total, so any drift is absorbed into the last (precise: only) bucket
 * — same principle calculateOrderGst already applies to its own rounding.
 */
/**
 * Shared "precise match" GST-scaling math — given one order line's real,
 * discount-adjusted GST split (from calculateOrderGst) and the amount being
 * refunded against it, returns that line's tax attribution scaled down to
 * the refund. Shared by ensureCreditNoteForRefund's real-Razorpay-refund
 * path and insertCodRefundCreditNote's manual-COD-refund path below — same
 * math either way, only how the refund itself was actually sent differs.
 * See ensureCreditNoteForRefund's own docstring for the full reasoning
 * (why this scales the item's raw refund by its discounted share, why
 * rounding drift is absorbed into the taxable value, why the ideal total is
 * capped at the item's real discounted value).
 */
function scaleGstForRefundedItem(
  matchedLine: GstLineResult,
  amountRefundedPaise: number,
): {
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  rateBreakdown: GstRateBreakdown[];
} {
  const itemFraction =
    matchedLine.lineTotal > 0
      ? Math.min(1, amountRefundedPaise / matchedLine.lineTotal)
      : 0;

  const scaledTaxable = Math.round(matchedLine.taxableAmount * itemFraction);
  const scaledCgst = Math.round(matchedLine.cgst * itemFraction);
  const scaledSgst = Math.round(matchedLine.sgst * itemFraction);
  const scaledIgst = Math.round(matchedLine.igst * itemFraction);

  const idealTotal = Math.min(amountRefundedPaise, matchedLine.discountedLineTotal);
  const roundedTotal = scaledTaxable + scaledCgst + scaledSgst + scaledIgst;
  const drift = idealTotal - roundedTotal;

  const taxableValue = scaledTaxable + drift;
  return {
    taxableValue,
    cgst: scaledCgst,
    sgst: scaledSgst,
    igst: scaledIgst,
    rateBreakdown: [
      {
        ratePercent: matchedLine.gstRatePercent,
        taxableAmount: taxableValue,
        cgst: scaledCgst,
        sgst: scaledSgst,
        igst: scaledIgst,
      },
    ],
  };
}

async function ensureCreditNoteForRefund(
  order: OrderRow,
  params: { razorpayRefundId: string; amountRefundedPaise: number },
): Promise<void> {
  const existing = await db
    .select({ id: creditNotes.id })
    .from(creditNotes)
    .where(eq(creditNotes.razorpayRefundId, params.razorpayRefundId))
    .limit(1);
  if (existing.length > 0) return;

  // Credit note sequence is FY-scoped like invoices (see
  // ensureCreditNoteSequence's own comment) — bootstrapped here, outside the
  // transaction below, exactly like ensureInvoiceSequence's own call site in
  // markOrderPaid: it does its own advisory-locked transaction and is a
  // cheap no-op after the first call each FY.
  const financialYear = currentFinancialYear();
  const creditNoteSeqName = creditNoteSequenceName(financialYear);
  const creditNotePrefix = `CN/${financialYear}/`;
  await ensureCreditNoteSequence(creditNoteSeqName, creditNotePrefix);

  await db.transaction(async (tx) => {
    // Re-check inside the transaction — closes the race between the
    // pre-check above and this insert if two redeliveries land concurrently.
    // The insert below is also guarded by the UNIQUE constraint via
    // onConflictDoNothing as a final backstop.
    const existingInner = await tx
      .select({ id: creditNotes.id })
      .from(creditNotes)
      .where(eq(creditNotes.razorpayRefundId, params.razorpayRefundId))
      .limit(1);
    if (existingInner.length > 0) return;

    const interState = isInterStateOrder(
      (order.shippingAddress as { state?: string })?.state ?? "",
    );

    const allItems = await tx
      .select({
        id: orderItems.id,
        unitPrice: orderItems.unitPriceSnapshot,
        quantity: orderItems.quantity,
        lineTotal: orderItems.lineTotal,
      })
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id));

    // Real, discount-adjusted GST for every line on this order — the same
    // calculation buildInvoiceData used to generate the original tax
    // invoice, so whatever this credit note reverses is bounded by what was
    // genuinely charged.
    const gst = calculateOrderGst(
      allItems.map((i) => ({
        unitPrice: i.unitPrice,
        quantity: i.quantity,
        lineTotal: i.lineTotal,
      })),
      order.discount,
      interState,
    );

    const [matchedReturn] = await tx
      .select({ returnId: returns.id, orderItemId: returns.orderItemId })
      .from(returns)
      .where(eq(returns.razorpayRefundId, params.razorpayRefundId))
      .limit(1);

    const matchedIndex = matchedReturn
      ? allItems.findIndex((i) => i.id === matchedReturn.orderItemId)
      : -1;

    let taxableValue: number;
    let cgst: number;
    let sgst: number;
    let igst: number;
    let rateBreakdown: {
      ratePercent: number;
      taxableAmount: number;
      cgst: number;
      sgst: number;
      igst: number;
    }[];
    let needsReview: boolean;
    let returnId: string | null;

    if (matchedReturn && matchedIndex >= 0) {
      const scaled = scaleGstForRefundedItem(gst.lines[matchedIndex], params.amountRefundedPaise);
      taxableValue = scaled.taxableValue;
      cgst = scaled.cgst;
      sgst = scaled.sgst;
      igst = scaled.igst;
      rateBreakdown = scaled.rateBreakdown;
      needsReview = false;
      returnId = matchedReturn.returnId;
    } else {
      const totalInvoicedInclGst = gst.lines.reduce(
        (sum, l) => sum + l.discountedLineTotal,
        0,
      );
      const scale =
        totalInvoicedInclGst > 0
          ? params.amountRefundedPaise / totalInvoicedInclGst
          : 0;

      const scaledBreakdown = gst.rateBreakdown.map((b) => ({
        ratePercent: b.ratePercent,
        taxableAmount: Math.round(b.taxableAmount * scale),
        cgst: Math.round(b.cgst * scale),
        sgst: Math.round(b.sgst * scale),
        igst: Math.round(b.igst * scale),
      }));

      const roundedTotal = scaledBreakdown.reduce(
        (s, b) => s + b.taxableAmount + b.cgst + b.sgst + b.igst,
        0,
      );
      const drift = params.amountRefundedPaise - roundedTotal;
      if (drift !== 0 && scaledBreakdown.length > 0) {
        scaledBreakdown[scaledBreakdown.length - 1].taxableAmount += drift;
      }

      rateBreakdown = scaledBreakdown;
      taxableValue = rateBreakdown.reduce((s, b) => s + b.taxableAmount, 0);
      cgst = rateBreakdown.reduce((s, b) => s + b.cgst, 0);
      sgst = rateBreakdown.reduce((s, b) => s + b.sgst, 0);
      igst = rateBreakdown.reduce((s, b) => s + b.igst, 0);
      needsReview = true;
      returnId = null;
    }

    // Sequence number generated inside this same INSERT's values, nothing
    // after it that can still fail — mirrors markOrderPaid's invoice-number
    // discipline (see its docstring) so a losing/failed write never burns a
    // permanent gap in the credit-note sequence.
    await tx
      .insert(creditNotes)
      .values({
        orderId: order.id,
        returnId,
        razorpayRefundId: params.razorpayRefundId,
        creditNoteNumber: sql`${creditNotePrefix} || lpad(nextval('${sql.raw(creditNoteSeqName)}')::text, 5, '0')`,
        refundedAmount: params.amountRefundedPaise,
        taxableValue,
        cgst,
        sgst,
        igst,
        rateBreakdown,
        needsReview,
      })
      .onConflictDoNothing({ target: creditNotes.razorpayRefundId });
  });
}

/**
 * Counterpart to ensureCreditNoteForRefund for a manually-refunded COD
 * return (lib/actions/admin/returns.ts's recordCodRefundSent) — there's no
 * real Razorpay refund to key off, so razorpayRefundId is null on the
 * inserted row (legal per credit_notes' partial unique index). Always uses
 * the "precise match" GST attribution: unlike a dashboard refund, a COD
 * manual refund always has a known return + order item (the caller already
 * holds both), so there's no fallback/needsReview case here.
 *
 * Idempotency is NOT this function's job. recordCodRefundSent's own
 * refund_pending -> refunded transition (a locked read + explicit status
 * check, same pattern markReturnQc uses for its own refund) is what
 * guarantees this only ever runs once per return — the partial unique index
 * allows unlimited NULLs, so it does nothing to prevent a double-insert on
 * its own, unlike the real-refund path's index on a real razorpayRefundId.
 */
export async function insertCodRefundCreditNote(params: {
  orderId: string;
  returnId: string;
  orderItemId: string;
  amountRefundedPaise: number;
}): Promise<void> {
  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.id, params.orderId))
    .limit(1);
  if (!order) {
    throw new Error(`Order ${params.orderId} not found for COD refund credit note`);
  }

  const financialYear = currentFinancialYear();
  const creditNoteSeqName = creditNoteSequenceName(financialYear);
  const creditNotePrefix = `CN/${financialYear}/`;
  await ensureCreditNoteSequence(creditNoteSeqName, creditNotePrefix);

  const interState = isInterStateOrder(
    (order.shippingAddress as { state?: string })?.state ?? "",
  );

  const allItems = await db
    .select({
      id: orderItems.id,
      unitPrice: orderItems.unitPriceSnapshot,
      quantity: orderItems.quantity,
      lineTotal: orderItems.lineTotal,
    })
    .from(orderItems)
    .where(eq(orderItems.orderId, order.id));

  const gst = calculateOrderGst(
    allItems.map((i) => ({
      unitPrice: i.unitPrice,
      quantity: i.quantity,
      lineTotal: i.lineTotal,
    })),
    order.discount,
    interState,
  );

  const matchedIndex = allItems.findIndex((i) => i.id === params.orderItemId);
  if (matchedIndex < 0) {
    throw new Error(
      `Order item ${params.orderItemId} not found on order ${order.id} for COD refund credit note`,
    );
  }

  const scaled = scaleGstForRefundedItem(gst.lines[matchedIndex], params.amountRefundedPaise);

  await db.insert(creditNotes).values({
    orderId: order.id,
    returnId: params.returnId,
    razorpayRefundId: null,
    creditNoteNumber: sql`${creditNotePrefix} || lpad(nextval('${sql.raw(creditNoteSeqName)}')::text, 5, '0')`,
    refundedAmount: params.amountRefundedPaise,
    taxableValue: scaled.taxableValue,
    cgst: scaled.cgst,
    sgst: scaled.sgst,
    igst: scaled.igst,
    rateBreakdown: scaled.rateBreakdown,
    needsReview: false,
  });
}

/**
 * Permanently deletes orders that never completed payment (payment_status
 * "pending" or "failed") and are older than `staleDays`. Every checkout
 * attempt inserts a real order row before Razorpay even opens (see
 * initCheckout in lib/actions/checkout.ts), so an abandoned or declined
 * checkout otherwise sits in the admin order list forever. Orders that
 * reached "paid" — including ones later refunded, returned, or RTO'd by the
 * courier — are never touched by this filter, since they're all
 * payment_status "paid"/"refunded"/"partially_refunded", never
 * "pending"/"failed".
 *
 * Before actually deleting, every candidate that has a razorpayOrderId is
 * re-checked directly against Razorpay's own API — our own paymentStatus can
 * be wrong (a payment.captured webhook that never landed, e.g. a
 * misconfigured or missing RAZORPAY_WEBHOOK_SECRET, a real incident this
 * project already hit once) and this is the last chance to catch that before
 * the order — and everything that proves the customer actually paid — is
 * gone for good. A candidate is only deleted if Razorpay confirms it was
 * genuinely never paid, OR it never got far enough to have a
 * razorpayOrderId at all (nothing to check — no payment could exist).
 * Anything Razorpay says IS paid, or that the check itself fails to
 * determine (a transient API error), is left alone and reported separately
 * — deletion is the one place here that must fail closed, not open — and an
 * admin is alerted so a human can reconcile it by hand.
 *
 * message_log.order_id has no ON DELETE cascade, so any log row is detached
 * first — in practice a pending/failed order should never have one (every
 * WhatsApp template only fires after payment succeeds), but this keeps the
 * delete from ever failing on a stray row instead of silently skipping it.
 */
export async function deleteStaleUnpaidOrders(
  staleDays = 7,
): Promise<{
  deletedCount: number;
  orderNumbers: string[];
  heldForReviewCount: number;
  heldForReviewOrderNumbers: string[];
}> {
  const cutoff = new Date(Date.now() - staleDays * 24 * 60 * 60 * 1000);

  const stale = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      razorpayOrderId: orders.razorpayOrderId,
    })
    .from(orders)
    .where(
      and(
        inArray(orders.paymentStatus, ["pending", "failed"]),
        lt(orders.createdAt, cutoff),
      ),
    );

  if (stale.length === 0) {
    return { deletedCount: 0, orderNumbers: [], heldForReviewCount: 0, heldForReviewOrderNumbers: [] };
  }

  const safeToDelete: typeof stale = [];
  const heldForReview: typeof stale = [];

  for (const order of stale) {
    if (!order.razorpayOrderId) {
      // Checkout never even reached Razorpay — no payment could exist.
      safeToDelete.push(order);
      continue;
    }
    try {
      const rpStatus = await fetchRazorpayOrderStatus(order.razorpayOrderId);
      if (rpStatus.status === "paid" || rpStatus.amountPaid > 0) {
        heldForReview.push(order);
      } else {
        safeToDelete.push(order);
      }
    } catch (err) {
      // Can't confirm it's safe — never guess in favor of an irreversible
      // delete. Leave it for the next run and flag it now.
      console.error(
        `[cleanup-orders] Razorpay status check failed for ${order.orderNumber} (${order.razorpayOrderId}) — holding, not deleting:`,
        err,
      );
      heldForReview.push(order);
    }
  }

  if (heldForReview.length > 0) {
    await alertAdminSuspiciousActivity({
      event: "Stale-order cleanup held orders back for manual review",
      detail: `${heldForReview.length} order(s) marked pending/failed locally but Razorpay shows as paid (or their status couldn't be confirmed), so they were NOT deleted: ${heldForReview.map((o) => o.orderNumber).join(", ")}. Check /studio/orders and reconcile payment status by hand.`,
    }).catch((err) => {
      console.error("[cleanup-orders] failed to alert admin about held orders:", err);
    });
  }

  if (safeToDelete.length === 0) {
    return {
      deletedCount: 0,
      orderNumbers: [],
      heldForReviewCount: heldForReview.length,
      heldForReviewOrderNumbers: heldForReview.map((o) => o.orderNumber),
    };
  }

  const ids = safeToDelete.map((o) => o.id);

  // Re-derive who's actually still deletable right before acting, instead
  // of trusting `ids` from the loop above — that loop makes one sequential
  // Razorpay call per candidate, so by the time a later candidate is
  // checked, an earlier one's per-order check can be seconds to tens of
  // seconds stale. A real payment.captured webhook (a fully independent
  // request) landing for one of these orders in that window must not be
  // silently deleted along with the genuinely-abandoned ones. This fresh,
  // minimal re-select — immediately before both the messageLog detach and
  // the delete — is what keeps this irreversible operation actually safe.
  const stillPending = await db
    .select({ id: orders.id, orderNumber: orders.orderNumber })
    .from(orders)
    .where(and(inArray(orders.id, ids), inArray(orders.paymentStatus, ["pending", "failed"])));
  const stillPendingIds = stillPending.map((o) => o.id);

  if (stillPendingIds.length > 0) {
    await db
      .update(messageLog)
      .set({ orderId: null })
      .where(inArray(messageLog.orderId, stillPendingIds));
  }

  // The WHERE clause here is the actual safety guarantee (a single atomic
  // statement, evaluated against whatever is truly current at the instant
  // it runs) — the re-select above narrows the window this closes, this is
  // what closes it. Any order that became paid between the re-select and
  // this statement is still correctly excluded.
  const deleted =
    stillPendingIds.length === 0
      ? []
      : await db
          .delete(orders)
          .where(
            and(
              inArray(orders.id, stillPendingIds),
              inArray(orders.paymentStatus, ["pending", "failed"]),
            ),
          )
          .returning({ id: orders.id, orderNumber: orders.orderNumber });

  const deletedIds = new Set(deleted.map((o) => o.id));
  const savedByLateCapture = safeToDelete.filter((o) => !deletedIds.has(o.id));

  if (savedByLateCapture.length > 0) {
    await alertAdminSuspiciousActivity({
      event: "Stale-order cleanup narrowly avoided deleting a now-paid order",
      detail: `${savedByLateCapture.length} order(s) were confirmed unpaid via Razorpay earlier in this cleanup run, but had become paid by the moment of deletion and were excluded: ${savedByLateCapture.map((o) => o.orderNumber).join(", ")}. No action needed — these orders are fine as paid orders — but worth a glance at /studio/orders if anything looks off.`,
    }).catch((err) => {
      console.error("[cleanup-orders] failed to alert admin about late-capture save:", err);
    });
  }

  return {
    deletedCount: deleted.length,
    orderNumbers: deleted.map((o) => o.orderNumber),
    heldForReviewCount: heldForReview.length,
    heldForReviewOrderNumbers: heldForReview.map((o) => o.orderNumber),
  };
}

/** Delhivery's own documented delivery window for standard domestic surface
 * shipments tops out around 7 days; 5 gives a real margin before flagging,
 * so this only fires for a shipment that's genuinely stuck, not one that's
 * just slow. */
const STALE_SHIPMENT_DAYS = 5;

/**
 * Catches the exact failure class found on AARNA-001023 (Jul 2026): the
 * Delhivery status webhook silently stopped reaching the app — Delhivery's
 * own tracking showed real "Out for delivery" and "Delivered" scans that
 * never updated the order, with nothing in the app surfacing an error,
 * because a webhook that's simply never called (wrong/stale URL on
 * Delhivery's side, a token mismatch, DNS not yet cut over, etc.) produces
 * no failed request for anything on our side to notice — same blind spot
 * class as the Razorpay webhook secret going missing from Vercel production
 * for a long stretch (see CLAUDE.md).
 *
 * Riding the existing daily cron (app/api/cron/cleanup-orders/route.ts)
 * rather than adding a second Vercel Cron entry — same reasoning already
 * documented there for bundling the rate-limit cleanup in.
 *
 * Deliberately re-alerts every day a shipment remains stuck rather than
 * tracking "already alerted" state — an unresolved silent failure should
 * keep surfacing until a human actually looks at it, not go quiet after
 * the first email, and this needs no extra schema to do that.
 */
export async function alertStaleShipments(
  staleDays = STALE_SHIPMENT_DAYS,
): Promise<{ staleCount: number; orderNumbers: string[] }> {
  const cutoff = new Date(Date.now() - staleDays * 24 * 60 * 60 * 1000);

  const stale = await db
    .select({
      orderNumber: orders.orderNumber,
      awbNumber: orders.awbNumber,
      fulfillmentStatus: orders.fulfillmentStatus,
      placedAt: orders.placedAt,
    })
    .from(orders)
    .where(
      and(
        inArray(orders.fulfillmentStatus, ["shipped", "out_for_delivery"]),
        lt(orders.placedAt, cutoff),
      ),
    );

  if (stale.length === 0) {
    return { staleCount: 0, orderNumbers: [] };
  }

  await alertAdminSuspiciousActivity({
    event: `${stale.length} order(s) stuck mid-shipment past Delhivery's typical delivery window`,
    detail: `Placed more than ${staleDays} day(s) ago and still showing as in-transit locally, with no further Delhivery status update since: ${stale
      .map((o) => `${o.orderNumber} (AWB ${o.awbNumber ?? "none"}, currently "${o.fulfillmentStatus}")`)
      .join(", ")}. This almost always means the Delhivery status webhook isn't reaching the app (check the webhook URL and DELHIVERY_WEBHOOK_TOKEN), not that the shipment is genuinely still moving — check each AWB directly on Delhivery's own tracking and correct the status by hand via /studio/orders if it's actually already delivered.`,
  }).catch((err) => {
    console.error("[cleanup-orders] failed to alert admin about stale shipments:", err);
  });

  return { staleCount: stale.length, orderNumbers: stale.map((o) => o.orderNumber) };
}

export interface DelhiveryStatusSyncResult {
  /** False if this AWB doesn't map to a known order, or the status label
   *  doesn't map to anything mapDelhiveryStatus recognizes. */
  matched: boolean;
  /** False if matched but the transition was rejected by
   *  canTransitionFulfillment (out-of-order/invalid push) — nothing changed. */
  applied: boolean;
  /** True only on a genuine NEW arrival at "delivered" (order wasn't already
   *  "delivered" before this call) — this is what gates the WhatsApp send,
   *  so a repeat observation of the same delivered shipment never re-sends it. */
  newlyDelivered: boolean;
  orderNumber?: string;
}

/**
 * Applies one observed Delhivery status (a courier scan) to whichever order
 * owns this AWB. This is the single place that decides what happens when we
 * learn an order's real shipment status — shared by the real-time webhook
 * (app/api/webhooks/delhivery) and the daily reconciliation sweep
 * (syncInFlightShipmentStatuses below), so both paths behave identically and
 * can never drift out of sync with each other. See
 * lib/orders/fulfillment-transitions.ts for the out-of-order-push guard this
 * relies on.
 *
 * Fixes a real gap in the webhook's own previous inline version: the
 * "delivered" WhatsApp send had no guard against firing again on a repeat
 * "delivered" observation (Delhivery webhook retries, or this function being
 * called twice for the same already-delivered order), unlike the sibling
 * "returned" RTO-alert branch which already correctly checked
 * `order.fulfillmentStatus !== "returned"` first. `newlyDelivered` here
 * closes that gap for both callers at once.
 *
 * The DB update itself is awaited (the state change must be durable before
 * this function returns), but the notification side effects (WhatsApp,
 * admin email) are deferred via next/server's `after()` rather than
 * awaited — Delhivery's webhook integration requires a P99 response time
 * under 500ms or it times out and the scan is lost; a real, synchronous
 * network call to Interakt (or Resend) on every "delivered"/"returned"
 * event risked blowing well past that on a slow BSP response, on exactly
 * the events this integration exists to catch. `after()` still runs these
 * to completion (Vercel keeps the function alive for it) — it just doesn't
 * block the HTTP response Delhivery is timing.
 */
export async function applyDelhiveryStatus(
  awb: string,
  statusLabel: string,
  statusType?: string,
): Promise<DelhiveryStatusSyncResult> {
  const next = mapDelhiveryStatus(statusLabel, statusType);
  if (!next) return { matched: false, applied: false, newlyDelivered: false };

  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.awbNumber, awb))
    .limit(1);
  if (!order) return { matched: false, applied: false, newlyDelivered: false };

  if (!canTransitionFulfillment(order.fulfillmentStatus, next)) {
    return { matched: true, applied: false, newlyDelivered: false, orderNumber: order.orderNumber };
  }

  const newlyDelivered = next === "delivered" && order.fulfillmentStatus !== "delivered";
  const newlyReturned = next === "returned" && order.fulfillmentStatus !== "returned";

  // Whether THIS call is the one that flips a COD order's cash-collected
  // status — a courier "Delivered" scan is our proxy for "cash was
  // collected" (see lib/checkout/cod.ts's design notes), the same way a
  // Razorpay capture is trusted as "paid" without waiting for bank
  // settlement. Computed from a guarded conditional UPDATE inside the same
  // transaction as the fulfillment write below, not from the `order`
  // snapshot read above — that snapshot can be stale under concurrency
  // (the real-time webhook and the 5-minute sync cron can both observe the
  // same delivery near-simultaneously), and a stale-snapshot decision here
  // is exactly the class of bug markOrderPaid's own comment warns about:
  // it would risk both calls believing they need to run the paid-order side
  // effects (coupon usage) and double-counting a redemption.
  let codJustCollected = false;

  await db.transaction(async (tx) => {
    await tx
      .update(orders)
      .set({
        fulfillmentStatus: next,
        updatedAt: new Date(),
        // coalesce, not an unconditional set — Delhivery can push "delivered"
        // more than once (retries), and a repeat push must not push the
        // return window's start date forward.
        ...(next === "delivered"
          ? { deliveredAt: sql`coalesce(${orders.deliveredAt}, now())` }
          : {}),
      })
      .where(eq(orders.awbNumber, awb));

    if (newlyDelivered && order.paymentMethod === "cod") {
      const flipped = await tx
        .update(orders)
        .set({ paymentStatus: "paid" })
        .where(and(eq(orders.awbNumber, awb), eq(orders.paymentStatus, "cod_pending")))
        .returning({ id: orders.id });
      codJustCollected = flipped.length > 0;
    }
  });

  if (newlyDelivered) {
    after(() =>
      notifyWhatsApp({
        orderId: order.id,
        phone: order.phone,
        whatsappOptIn: order.whatsappOptIn,
        templateKey: "delivered",
        bodyValues: [firstNameFromAddress(order.shippingAddress), order.orderNumber],
      }),
    );
  }

  // Coupon usage is spent here for COD — the exact same "only once revenue
  // is real" point the payment.captured webhook spends it at for prepaid
  // (lib/db/queries/orders.ts's incrementCouponUsage/checkCouponPerCustomerOverage
  // doc comments) — never at order placement, so an abandoned or
  // never-collected COD order can't exhaust a coupon's budget. Deferred via
  // after() for the same P99-response-time reason the notifications above
  // are — this must never slow down the webhook's own response to Delhivery.
  if (codJustCollected && order.couponCode) {
    after(async () => {
      try {
        const counted = await incrementCouponUsage(order.couponCode!);
        if (!counted) {
          console.warn(
            "[delhivery status sync] coupon usage limit already reached, not counted:",
            order.couponCode,
            order.orderNumber,
          );
          await alertAdminSuspiciousActivity({
            event: "Coupon redeemed past its usage limit",
            detail: `Order ${order.orderNumber} (COD) had its cash collection confirmed with coupon "${order.couponCode}", but the coupon's usage limit was already reached by other concurrent redemptions — this redemption's discount was still honored (already applied at checkout), just not counted toward the limit. Check /studio/coupons.`,
          }).catch((err) => {
            console.error("[delhivery status sync] over-redemption alert failed:", err);
          });
        }
      } catch (err) {
        console.error("[delhivery status sync] coupon usage increment failed:", err);
      }

      if (order.customerId) {
        try {
          const overage = await checkCouponPerCustomerOverage(order.customerId, order.couponCode!);
          if (overage?.overLimit) {
            console.warn(
              "[delhivery status sync] coupon per-customer limit exceeded:",
              order.couponCode,
              order.orderNumber,
              overage,
            );
            await alertAdminSuspiciousActivity({
              event: "Coupon redeemed past its per-customer limit",
              detail: `Order ${order.orderNumber} (COD) confirmed with coupon "${order.couponCode}" — this customer has now redeemed it ${overage.timesUsed} time(s), over their per-customer limit of ${overage.limit}. Each redemption's discount was already honored on its own order total/invoice and is not reversed. Check /studio/coupons and /studio/orders.`,
            }).catch((err) => {
              console.error("[delhivery status sync] per-customer overage alert failed:", err);
            });
          }
        } catch (err) {
          console.error("[delhivery status sync] coupon per-customer overage check failed:", err);
        }
      }
    });
  }

  // RTO — see the identical comment previously inline in the webhook route
  // for why this deliberately does NOT auto-restock: an RTO parcel has been
  // through transit and a failed delivery attempt, so it needs a human
  // eyes-on check for transit damage before it's fit to sell again.
  if (newlyReturned) {
    after(() =>
      alertAdminSuspiciousActivity({
        event: "Shipment returned to origin — needs inspection before restocking",
        detail: `Order ${order.orderNumber} (AWB ${awb}) was returned to origin by Delhivery. Stock was NOT automatically restocked — inspect the parcel for transit damage or tampering first, then add it back via /studio/inventory if it's sellable.`,
      }).catch((err) => {
        console.error("[delhivery status sync] RTO alert failed:", awb, err);
      }),
    );
  }

  return { matched: true, applied: true, newlyDelivered, orderNumber: order.orderNumber };
}

/**
 * Daily reconciliation sweep — for every order still "shipped"/
 * "out_for_delivery" with an AWB, asks Delhivery's own tracking API what's
 * actually true and applies it via applyDelhiveryStatus, exactly as if that
 * status had arrived through the real-time webhook. This is the actual fix
 * for the failure class alertStaleShipments only detects and emails a human
 * about (see its own comment) — this closes the loop automatically, same-day,
 * without waiting for STALE_SHIPMENT_DAYS or manual admin correction.
 * alertStaleShipments stays in place as a backstop for whatever this can't
 * resolve itself (e.g. Delhivery's tracking API down that day, or an AWB it
 * doesn't recognize) — a genuinely stuck order still surfaces to a human
 * rather than going silent forever.
 *
 * Riding the existing daily cron rather than a second Vercel Cron entry —
 * same reasoning already documented on alertStaleShipments and the rate-limit
 * cleanup above it.
 *
 * Sequential, not parallel — current order volume is small enough that this
 * finishes in seconds either way, and sequential is gentler on Delhivery's
 * API. Revisit if order volume grows enough for this to matter.
 */
export async function syncInFlightShipmentStatuses(): Promise<{
  checked: number;
  updated: number;
  newlyDelivered: number;
  errors: number;
}> {
  const inFlight = await db
    .select({ awbNumber: orders.awbNumber })
    .from(orders)
    .where(
      and(
        inArray(orders.fulfillmentStatus, ["shipped", "out_for_delivery"]),
        isNotNull(orders.awbNumber),
      ),
    );

  // isNotNull above already guarantees this at the SQL level; the filter is
  // just to narrow the TS type from `string | null` to `string`.
  const withAwb = inFlight.filter((o): o is { awbNumber: string } => o.awbNumber !== null);

  let updated = 0;
  let newlyDelivered = 0;
  let errors = 0;

  for (const { awbNumber } of withAwb) {
    try {
      const tracking = (await trackShipment(awbNumber)) as {
        ShipmentData?: { Shipment?: { Status?: { Status?: string; StatusType?: string } } }[];
      };
      const status = tracking?.ShipmentData?.[0]?.Shipment?.Status;
      if (!status?.Status) continue;

      const result = await applyDelhiveryStatus(awbNumber, status.Status, status.StatusType);
      if (result.applied) {
        updated++;
        if (result.newlyDelivered) newlyDelivered++;
      }
    } catch (err) {
      errors++;
      console.error(`[sync-delivery-status] tracking check failed for AWB ${awbNumber}:`, err);
    }
  }

  return { checked: withAwb.length, updated, newlyDelivered, errors };
}

/**
 * Transforms a DB order into the shape the invoice PDF template expects.
 * Prices in DB are stored as paise (integer), GST-inclusive.
 */
export function buildInvoiceData(
  order: OrderWithItems,
  invoiceNumber: string,
): InvoiceData {
  const shipping = order.shippingAddress as {
    fullName: string;
    phone: string;
    line1: string;
    line2?: string;
    city: string;
    state: string;
    pincode: string;
  };

  const interState = isInterStateOrder(shipping.state);
  const gst = calculateOrderGst(
    order.orderItems.map((item) => ({
      unitPrice: item.unitPriceSnapshot,
      quantity: item.quantity,
      lineTotal: item.lineTotal,
    })),
    order.discount,
    interState,
  );

  const fmt = (d: Date) =>
    d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

  return {
    invoiceNumber,
    // order.placedAt is set once, at the same moment invoiceNumber is
    // assigned (see markOrderPaid) — using "now" here instead was fine for
    // the original webhook-triggered PDF (runs moments after placedAt) but
    // wrong for reprints/batch-print, which call this same function for
    // orders paid long ago. Falls back to "now" only in the type-level case
    // of an order this function should never see un-paid.
    invoiceDate: fmt(order.placedAt ?? new Date()),
    orderNumber: order.orderNumber,
    orderDate: fmt(order.createdAt),
    customer: {
      name: shipping.fullName,
      email: order.email,
      phone: order.phone,
      gstin: order.gstNumber,
      address: {
        line1: shipping.line1,
        line2: shipping.line2,
        city: shipping.city,
        state: shipping.state,
        pincode: shipping.pincode,
      },
    },
    items: order.orderItems.map((item, i) => ({
      description: item.productTitleSnapshot,
      size: item.variantLabelSnapshot,
      sku: item.skuSnapshot,
      quantity: item.quantity,
      unitPrice: item.unitPriceSnapshot,
      lineTotal: item.lineTotal,
      gstRatePercent: gst.lines[i].gstRatePercent,
    })),
    subtotal: order.subtotal,
    discount: order.discount,
    shippingFee: order.shippingFee,
    codFee: order.codFee,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    isInterState: interState,
    rateBreakdown: gst.rateBreakdown,
    taxableAmount: gst.taxableAmount,
    cgst: gst.cgst,
    sgst: gst.sgst,
    igst: gst.igst,
    total: order.total,
  };
}
