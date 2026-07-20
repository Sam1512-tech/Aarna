import { NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/razorpay";
import { nextInvoiceNumber } from "@/lib/invoice/counter";
import { generateInvoicePdf } from "@/lib/invoice/generate";
import {
  buildInvoiceData,
  clearPurchasedCartItems,
  getOrderByRazorpayId,
  markOrderPaid,
  markOrderPaymentFailed,
  recordRefund,
} from "@/lib/db/queries/orders";
import { applyStockMovement } from "@/lib/db/queries/inventory";
import { sendEmail } from "@/lib/resend";
import { notifyWhatsApp, firstNameFromAddress, rupees } from "@/lib/whatsapp/notify";

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

      // Idempotency — skip if already processed
      if (order.paymentStatus === "paid") break;

      const invoiceNumber = await nextInvoiceNumber();
      await markOrderPaid(order.id, invoiceNumber, payment.id);

      // Decrement stock now that payment is confirmed. Best-effort — a
      // confirmed, paid order must never be blocked by an inventory-side
      // failure; a decrement that doesn't land here shows up as a stock
      // mismatch an admin can reconcile in /admin/inventory.
      await applyStockMovement(
        order.orderItems.map((item) => ({
          variantId: item.variantId,
          quantity: item.quantity,
        })),
        -1,
        "sale",
        order.orderNumber,
      ).catch((err) => {
        console.error("[razorpay webhook] stock decrement failed:", err);
      });

      await clearPurchasedCartItems(order).catch((err) => {
        // Never let a cart-clear failure break payment processing
        console.error("[razorpay webhook] cart clear failed:", err);
      });

      const invoiceData = buildInvoiceData(order, invoiceNumber);
      const pdfBuffer = await generateInvoicePdf(invoiceData);
      const pdfFilename = `${invoiceNumber.replace(/\//g, "-")}.pdf`;

      await sendEmail({
        to: order.email,
        subject: `Order Confirmed — ${order.orderNumber} | Aarna`,
        templateKey: "order_receipt",
        data: { order, invoiceNumber },
        attachments: [{ filename: pdfFilename, content: pdfBuffer }],
      }).catch((err) => {
        // Never let email failure break the webhook response
        console.error("[razorpay webhook] email send failed:", err);
      });

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
