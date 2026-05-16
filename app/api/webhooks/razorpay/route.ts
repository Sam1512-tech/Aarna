import { NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/razorpay";
import { nextInvoiceNumber } from "@/lib/invoice/counter";
import { generateInvoicePdf } from "@/lib/invoice/generate";
import { buildInvoiceData, getOrderByRazorpayId, markOrderPaid } from "@/lib/db/queries/orders";
import { sendEmail } from "@/lib/resend";

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

      break;
    }

    case "payment.failed": {
      const payment = event.payload?.payment?.entity;
      if (!payment?.order_id) break;
      // TODO: update order paymentStatus to "failed", notify customer
      console.log("[razorpay webhook] payment.failed for", payment.order_id);
      break;
    }

    case "refund.processed": {
      const refund = event.payload?.refund?.entity;
      if (!refund) break;
      // TODO: mark return as refunded, update order paymentStatus
      console.log("[razorpay webhook] refund.processed", refund.id);
      break;
    }

    default:
      break;
  }

  return NextResponse.json({ ok: true });
}
