import { NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/razorpay";
import { generateInvoicePdf } from "@/lib/invoice/generate";
import {
  buildInvoiceData,
  clearPurchasedCartItems,
  getOrderByRazorpayId,
  incrementCouponUsage,
  markOrderPaid,
  markOrderPaymentFailed,
  recordRefund,
} from "@/lib/db/queries/orders";
import { applyStockMovement } from "@/lib/db/queries/inventory";
import { sendEmail } from "@/lib/resend";
import { notifyWhatsApp, firstNameFromAddress, rupees } from "@/lib/whatsapp/notify";
import { alertAdminSuspiciousActivity } from "@/lib/security/alert-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-razorpay-signature");

  if (!signature || !verifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const event = JSON.parse(rawBody);

  switch (event?.event) {
    case "payment.captured": {
      const payment = event.payload?.payment?.entity;
      if (!payment?.order_id) break;

      const order = await getOrderByRazorpayId(payment.order_id);
      if (!order) {
        console.error("[razorpay webhook] order not found for", payment.order_id);
        break;
      }

      // Cheap pre-check to skip the invoice-number sequence for the common
      // case, but NOT the real idempotency guard — Razorpay documents
      // at-least-once delivery, so two deliveries can both reach this line
      // reading "pending". The real guard is markOrderPaid's own conditional
      // UPDATE below; only its winner runs the paid-order side effects.
      if (order.paymentStatus === "paid") break;

      // Stock for this order was already reserved atomically at checkout
      // (see initCheckout) — normally there's nothing left to do here. Two
      // cases still need a decrement now:
      //  - order.stockReserved is false: this order predates the reservation
      //    logic entirely (created right around deploy, under the old
      //    checkout that only checked stock without reserving it) — nothing
      //    was ever decremented for it, regardless of paymentStatus.
      //  - the reservation existed but was already given back — this
      //    capture arrived so late that releaseExpiredCheckoutHolds or an
      //    earlier payment.failed already released it (paymentStatus is
      //    "failed" right now).
      // Both are best-effort, same as the original unconditional decrement
      // this replaced: a confirmed, paid order must never be blocked by an
      // inventory-side failure, and if the unit already sold to someone else
      // in the gap, that's a genuine oversold conflict for an admin to
      // reconcile in /admin/inventory.
      const needsStockDecrementNow =
        !order.stockReserved || order.paymentStatus === "failed";

      const paidResult = await markOrderPaid(order.id, payment.id);
      if (!paidResult.won) break;
      const { invoiceNumber } = paidResult;

      // Coupon usage is spent here — at confirmed payment, not order
      // creation — and atomically bounded by its own usage limit. Never
      // let this block or crash the rest of the handler (same fail-open
      // rule as every other side effect below): the payment is already
      // captured and paymentStatus is already "paid" at this point, so an
      // unhandled throw here would return a non-2xx response, Razorpay
      // would retry, and the retry's own idempotency pre-check above would
      // then skip the ENTIRE handler — permanently stranding this order
      // with no invoice, no stock decrement, no confirmation email.
      if (order.couponCode) {
        try {
          const counted = await incrementCouponUsage(order.couponCode);
          if (!counted) {
            console.warn(
              "[razorpay webhook] coupon usage limit already reached, not counted:",
              order.couponCode,
              order.orderNumber,
            );
            await alertAdminSuspiciousActivity({
              event: "Coupon redeemed past its usage limit",
              detail: `Order ${order.orderNumber} paid with coupon "${order.couponCode}", but the coupon's usage limit was already reached by other concurrent paid orders — this redemption's discount was still honored (payment already captured), just not counted toward the limit. Check /studio/coupons.`,
            }).catch((err) => {
              console.error("[razorpay webhook] over-redemption alert failed:", err);
            });
          }
        } catch (err) {
          console.error("[razorpay webhook] coupon usage increment failed:", err);
        }
      }

      if (needsStockDecrementNow) {
        await applyStockMovement(
          order.orderItems.map((item) => ({
            variantId: item.variantId,
            quantity: item.quantity,
          })),
          -1,
          "sale",
          order.orderNumber,
        ).catch((err) => {
          console.error(
            "[razorpay webhook] late-capture stock re-decrement failed:",
            err,
          );
        });
      }

      await clearPurchasedCartItems(order).catch((err) => {
        // Never let a cart-clear failure break payment processing
        console.error("[razorpay webhook] cart clear failed:", err);
      });

      // The order is already committed "paid" (markOrderPaid above) and
      // paymentStatus === "paid" is the webhook's own idempotency pre-check
      // at the top of this handler — so if anything in here throws
      // uncaught, Razorpay's at-least-once retry would re-deliver this same
      // event, hit that pre-check, and skip this whole block forever. Never
      // let a PDF-rendering hiccup or a malformed legacy address (isInterStateOrder
      // can throw on one) leave a real customer permanently without their
      // confirmation with no automatic recovery — catch it, alert an admin
      // with a concrete recovery path, and keep the webhook response 200.
      try {
        const invoiceData = buildInvoiceData(order, invoiceNumber);
        const pdfBuffer = await generateInvoicePdf(invoiceData);
        const pdfFilename = `${invoiceNumber.replace(/\//g, "-")}.pdf`;

        await sendEmail({
          to: order.email,
          subject: `Order Confirmed — ${order.orderNumber} | Aarna`,
          templateKey: "order_receipt",
          data: { order, invoiceNumber },
          attachments: [{ filename: pdfFilename, content: pdfBuffer }],
        });
      } catch (err) {
        console.error("[razorpay webhook] invoice generation/email failed:", err);
        await alertAdminSuspiciousActivity({
          event: "Order confirmation email failed to send",
          detail: `Order ${order.orderNumber} (${invoiceNumber}) was paid successfully but the invoice PDF/confirmation email failed: ${err instanceof Error ? err.message : String(err)}. This never retries automatically (the webhook's own idempotency check skips re-processing a paid order). Use "Resend confirmation email" on /studio/orders/${order.orderNumber} once the underlying issue is fixed.`,
        }).catch((alertErr) => {
          console.error("[razorpay webhook] failure alert itself failed:", alertErr);
        });
      }

      // WhatsApp order confirmation (opt-in gated; no-op until Interakt is live)
      await notifyWhatsApp({
        orderId: order.id,
        phone: order.phone,
        whatsappOptIn: order.whatsappOptIn,
        templateKey: "order_placed",
        bodyValues: [
          firstNameFromAddress(order.shippingAddress),
          order.orderNumber,
          rupees(order.total),
        ],
      });

      break;
    }

    case "payment.failed": {
      const payment = event.payload?.payment?.entity;
      if (!payment?.order_id) break;

      // Razorpay's own decline reason — log it, since without this the only
      // trace of a failed payment is "it failed", with no way to tell a
      // genuine card decline from a config problem on our side.
      console.warn(
        "[razorpay webhook] payment.failed:",
        payment.order_id,
        payment.error_code,
        payment.error_description,
      );

      // Mark the order failed (no-op if it was already captured). We do NOT
      // email the customer — Razorpay Checkout already surfaces the failure in
      // real time, and payment-failed isn't one of Aarna's customer emails.
      const marked = await markOrderPaymentFailed(payment.order_id);
      if (!marked) {
        console.warn(
          "[razorpay webhook] payment.failed ignored (order not pending):",
          payment.order_id,
        );
      }
      break;
    }

    case "refund.processed": {
      const refund = event.payload?.refund?.entity;
      if (!refund?.id || !refund?.payment_id) break;

      const result = await recordRefund({
        razorpayPaymentId: refund.payment_id,
        razorpayRefundId: refund.id,
        amountRefundedPaise: refund.amount,
      });

      if (!result) {
        console.error(
          "[razorpay webhook] refund.processed — no order for payment",
          refund.payment_id,
        );
        break;
      }

      // Idempotency — already fully refunded means this is a webhook retry.
      if (result.isDuplicate) break;

      await sendEmail({
        to: result.order.email,
        subject: `Refund Processed — ${result.order.orderNumber} | Aarna`,
        templateKey: "refund_processed",
        data: { order: result.order, refundAmount: refund.amount },
      }).catch((err) => {
        console.error("[razorpay webhook] refund email failed:", err);
      });

      // WhatsApp refund confirmation (opt-in gated; no-op until Interakt is live)
      await notifyWhatsApp({
        orderId: result.order.id,
        phone: result.order.phone,
        whatsappOptIn: result.order.whatsappOptIn,
        templateKey: "refund_processed",
        bodyValues: [
          firstNameFromAddress(result.order.shippingAddress),
          rupees(refund.amount),
          result.order.orderNumber,
          "5–7 business days",
        ],
      });

      break;
    }

    default:
      break;
  }

  return NextResponse.json({ ok: true });
}
