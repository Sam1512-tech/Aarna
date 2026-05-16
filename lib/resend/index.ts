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
    default:
      return `<p>Message from Aarna.</p>`;
  }
}

function orderReceiptHtml(data: Record<string, unknown>): string {
  const order = data.order as { orderNumber: string; total: number } | undefined;
  const invoiceNumber = data.invoiceNumber as string | undefined;
  const orderNumber = order?.orderNumber ?? "";
  const total = order?.total ? `₹${(order.total / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body style="margin:0;padding:0;background:#FAF7F2;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#111111;">
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
              <p style="margin:0 0 8px;font-size:20px;font-weight:400;color:#111111;">Thank you for your order.</p>
              <p style="margin:0 0 24px;font-size:14px;color:#9D948E;line-height:1.6;">
                Your order has been confirmed and is being prepared with care.
              </p>

              <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E0D0C6;margin-bottom:24px;">
                <tr>
                  <td style="padding:12px 16px;border-bottom:1px solid #E0D0C6;font-size:12px;color:#9D948E;letter-spacing:1px;">ORDER NUMBER</td>
                  <td style="padding:12px 16px;border-bottom:1px solid #E0D0C6;font-size:12px;font-weight:600;text-align:right;">${orderNumber}</td>
                </tr>
                ${invoiceNumber ? `<tr>
                  <td style="padding:12px 16px;border-bottom:1px solid #E0D0C6;font-size:12px;color:#9D948E;letter-spacing:1px;">INVOICE</td>
                  <td style="padding:12px 16px;border-bottom:1px solid #E0D0C6;font-size:12px;font-weight:600;text-align:right;">${invoiceNumber}</td>
                </tr>` : ""}
                <tr>
                  <td style="padding:12px 16px;font-size:12px;color:#9D948E;letter-spacing:1px;">TOTAL PAID</td>
                  <td style="padding:12px 16px;font-size:12px;font-weight:600;text-align:right;color:#4B1323;">${total}</td>
                </tr>
              </table>

              <p style="margin:0 0 8px;font-size:13px;color:#555;line-height:1.7;">
                Your tax invoice is attached to this email as a PDF. You can also find your order details in your account at
                <a href="https://aarna.in/account" style="color:#4B1323;">aarna.in/account</a>.
              </p>
              <p style="margin:0;font-size:13px;color:#555;line-height:1.7;">
                Questions? Reply to this email or write to us at
                <a href="mailto:hello@aarna.in" style="color:#4B1323;">hello@aarna.in</a>.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px;background:#FAF7F2;border-top:1px solid #E0D0C6;text-align:center;">
              <p style="margin:0;font-size:11px;color:#9D948E;line-height:1.8;">
                Aarna Label · Giri Nagar, Bengaluru · GSTIN: 29ACNFA3302J1ZD<br/>
                Returns accepted within 14 days ·
                <a href="https://aarna.in/returns" style="color:#9D948E;">Return Policy</a>
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
