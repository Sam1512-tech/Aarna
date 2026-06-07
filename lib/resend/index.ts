import { Resend } from "resend";

let client: Resend | null = null;

function getResendClient(): Resend | null {
  if (client) return client;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  client = new Resend(apiKey);
  return client;
}

export type EmailTemplateKey =
  | "verify_email"
  | "password_reset"
  | "order_receipt"
  | "order_shipped"
  | "refund_processed";

export interface SendEmailInput {
  to: string;
  subject: string;
  templateKey: EmailTemplateKey;
  data: Record<string, unknown>;
  attachments?: { filename: string; content: Buffer }[];
}

export async function sendEmail(input: SendEmailInput): Promise<void> {
  const resend = getResendClient();

  if (!resend) {
    console.warn("[resend] RESEND_API_KEY not set — email not sent to", input.to);
    return;
  }

  const html = buildEmailHtml(input.templateKey, input.data);

  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_ADDRESS ?? "Aarna <hello@aarna.in>",
    to: input.to,
    subject: input.subject,
    html,
    attachments: input.attachments?.map((a) => ({
      filename: a.filename,
      content: a.content,
    })),
  });

  if (error) throw new Error(`Resend error: ${error.message}`);
}

function buildEmailHtml(templateKey: EmailTemplateKey, data: Record<string, unknown>): string {
  switch (templateKey) {
    case "order_receipt":
      return orderReceiptHtml(data);
    case "verify_email":
      return verifyEmailHtml(data);
    case "password_reset":
      return passwordResetHtml(data);
    case "order_shipped":
      return orderShippedHtml(data);
    case "refund_processed":
      return refundProcessedHtml(data);
    default:
      return `<p>Message from Aarna.</p>`;
  }
}

// ── Shared shell ─────────────────────────────────────────────────────────────

interface ShellOptions {
  preheader?: string;
  bodyHtml: string;
}

function shell({ preheader, bodyHtml }: ShellOptions): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body style="margin:0;padding:0;background:#FAF7F2;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#111111;">
  ${preheader ? `<div style="display:none;font-size:1px;color:#FAF7F2;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${preheader}</div>` : ""}
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#FAF7F2;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border:1px solid #E0D0C6;">
          <!-- Header -->
          <tr>
            <td style="background:#4B1323;padding:28px 40px;text-align:center;">
              <p style="margin:0;font-size:22px;font-weight:300;letter-spacing:6px;color:#FAF7F2;">AARNA</p>
              <p style="margin:4px 0 0;font-size:10px;letter-spacing:2px;color:#C8BFB3;">BY ARPITHA ABHISHEK</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              ${bodyHtml}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px;background:#FAF7F2;border-top:1px solid #E0D0C6;text-align:center;">
              <p style="margin:0;font-size:11px;color:#9D948E;line-height:1.8;">
                Aarna Label · Giri Nagar, Bengaluru · GSTIN: 29ACNFA3302J1ZD<br/>
                Questions? Write to <a href="mailto:hello@aarna.in" style="color:#9D948E;">hello@aarna.in</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function primaryButton(label: string, href: string): string {
  return `<table cellpadding="0" cellspacing="0" style="margin:24px 0;">
    <tr>
      <td style="background:#4B1323;">
        <a href="${href}" style="display:inline-block;padding:14px 32px;font-size:12px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:#FAF7F2;text-decoration:none;">${label}</a>
      </td>
    </tr>
  </table>`;
}

function detailRow(label: string, value: string, accent = false): string {
  const valueStyle = accent
    ? "font-size:12px;font-weight:600;text-align:right;color:#4B1323;"
    : "font-size:12px;font-weight:600;text-align:right;";
  return `<tr>
    <td style="padding:12px 16px;border-bottom:1px solid #E0D0C6;font-size:12px;color:#9D948E;letter-spacing:1px;">${label.toUpperCase()}</td>
    <td style="padding:12px 16px;border-bottom:1px solid #E0D0C6;${valueStyle}">${value}</td>
  </tr>`;
}

function INR(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}

function orderReceiptHtml(data: Record<string, unknown>): string {
  const order = data.order as { orderNumber: string; total: number } | undefined;
  const invoiceNumber = data.invoiceNumber as string | undefined;
  const orderNumber = order?.orderNumber ?? "";
  const total = order?.total ? INR(order.total) : "";

  const detailsTable = `<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E0D0C6;margin-bottom:24px;">
    ${detailRow("Order Number", orderNumber)}
    ${invoiceNumber ? detailRow("Invoice", invoiceNumber) : ""}
    ${detailRow("Total Paid", total, true)}
  </table>`;

  return shell({
    preheader: `Order ${orderNumber} confirmed — your invoice is attached.`,
    bodyHtml: `
      <p style="margin:0 0 8px;font-size:20px;font-weight:400;color:#111111;">Thank you for your order.</p>
      <p style="margin:0 0 24px;font-size:14px;color:#9D948E;line-height:1.6;">
        Your order has been confirmed and is being prepared with care.
      </p>
      ${detailsTable}
      <p style="margin:0 0 8px;font-size:13px;color:#555;line-height:1.7;">
        Your tax invoice is attached to this email as a PDF. You can also find your order details in your account at
        <a href="https://aarna.in/account" style="color:#4B1323;">aarna.in/account</a>.
      </p>
    `,
  });
}

// ── Verify email ─────────────────────────────────────────────────────────────

function verifyEmailHtml(data: Record<string, unknown>): string {
  const name = (data.name as string | undefined) ?? "there";
  const verifyUrl = (data.verifyUrl as string | undefined) ?? "https://aarna.in";

  return shell({
    preheader: "Confirm your email to start shopping at Aarna.",
    bodyHtml: `
      <p style="margin:0 0 8px;font-size:20px;font-weight:400;color:#111111;">Welcome, ${escapeHtml(name)}.</p>
      <p style="margin:0 0 16px;font-size:14px;color:#555;line-height:1.7;">
        Confirm your email to finish setting up your account. The link is valid for the next 24 hours.
      </p>
      ${primaryButton("Confirm Email", verifyUrl)}
      <p style="margin:24px 0 0;font-size:12px;color:#9D948E;line-height:1.6;">
        If the button doesn't work, copy and paste this link into your browser:<br/>
        <a href="${verifyUrl}" style="color:#4B1323;word-break:break-all;">${verifyUrl}</a>
      </p>
      <p style="margin:16px 0 0;font-size:12px;color:#9D948E;line-height:1.6;">
        If you didn't sign up for an account, you can safely ignore this email.
      </p>
    `,
  });
}

// ── Password reset ───────────────────────────────────────────────────────────

function passwordResetHtml(data: Record<string, unknown>): string {
  const resetUrl = (data.resetUrl as string | undefined) ?? "https://aarna.in";

  return shell({
    preheader: "Reset your Aarna account password.",
    bodyHtml: `
      <p style="margin:0 0 8px;font-size:20px;font-weight:400;color:#111111;">Reset your password.</p>
      <p style="margin:0 0 16px;font-size:14px;color:#555;line-height:1.7;">
        We received a request to reset the password for your Aarna account. Click below to choose a new one — the link is valid for the next hour.
      </p>
      ${primaryButton("Reset Password", resetUrl)}
      <p style="margin:24px 0 0;font-size:12px;color:#9D948E;line-height:1.6;">
        If the button doesn't work, copy and paste this link into your browser:<br/>
        <a href="${resetUrl}" style="color:#4B1323;word-break:break-all;">${resetUrl}</a>
      </p>
      <p style="margin:16px 0 0;font-size:12px;color:#9D948E;line-height:1.6;">
        If you didn't request a password reset, ignore this email — your password stays unchanged.
      </p>
    `,
  });
}

// ── Order shipped ────────────────────────────────────────────────────────────

function orderShippedHtml(data: Record<string, unknown>): string {
  const order = data.order as { orderNumber: string } | undefined;
  const orderNumber = order?.orderNumber ?? "";
  const awbNumber = (data.awbNumber as string | undefined) ?? "";
  const courierName = (data.courierName as string | undefined) ?? "Delhivery";
  const trackingUrl = (data.trackingUrl as string | undefined) ?? "";
  const estimatedDelivery = (data.estimatedDelivery as string | undefined) ?? "";

  const detailsTable = `<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E0D0C6;margin-bottom:24px;">
    ${detailRow("Order Number", orderNumber)}
    ${awbNumber ? detailRow("Tracking Number", awbNumber) : ""}
    ${detailRow("Courier", courierName)}
    ${estimatedDelivery ? detailRow("Expected By", estimatedDelivery, true) : ""}
  </table>`;

  return shell({
    preheader: `Order ${orderNumber} is on its way.`,
    bodyHtml: `
      <p style="margin:0 0 8px;font-size:20px;font-weight:400;color:#111111;">Your order is on its way.</p>
      <p style="margin:0 0 24px;font-size:14px;color:#9D948E;line-height:1.6;">
        We've handed your order over to ${escapeHtml(courierName)}. You'll receive an update once it's out for delivery.
      </p>
      ${detailsTable}
      ${trackingUrl ? primaryButton("Track Shipment", trackingUrl) : ""}
      <p style="margin:24px 0 0;font-size:13px;color:#555;line-height:1.7;">
        You can also track this order anytime from your account at
        <a href="https://aarna.in/account/orders" style="color:#4B1323;">aarna.in/account/orders</a>.
      </p>
    `,
  });
}

// ── Refund processed ─────────────────────────────────────────────────────────

function refundProcessedHtml(data: Record<string, unknown>): string {
  const order = data.order as { orderNumber: string } | undefined;
  const orderNumber = order?.orderNumber ?? "";
  const refundAmount = data.refundAmount as number | undefined;
  const refundAmountStr = refundAmount ? INR(refundAmount) : "";
  const paymentMethod =
    (data.paymentMethod as string | undefined) ?? "the original payment method";
  const expectedDays = (data.expectedDays as string | undefined) ?? "5–7 business days";

  const detailsTable = `<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E0D0C6;margin-bottom:24px;">
    ${detailRow("Order Number", orderNumber)}
    ${refundAmountStr ? detailRow("Refund Amount", refundAmountStr, true) : ""}
    ${detailRow("Refund Method", paymentMethod)}
    ${detailRow("Expected By", expectedDays)}
  </table>`;

  return shell({
    preheader: `Refund of ${refundAmountStr} processed for order ${orderNumber}.`,
    bodyHtml: `
      <p style="margin:0 0 8px;font-size:20px;font-weight:400;color:#111111;">Your refund is on its way.</p>
      <p style="margin:0 0 24px;font-size:14px;color:#9D948E;line-height:1.6;">
        We've processed your refund. It should reflect in your account within ${escapeHtml(expectedDays)}.
      </p>
      ${detailsTable}
      <p style="margin:0;font-size:13px;color:#555;line-height:1.7;">
        If you don't see the refund after the expected window, reply to this email and we'll help you trace it.
      </p>
    `,
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
