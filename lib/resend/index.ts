import { Resend } from "resend";

let client: Resend | null = null;

function getResendClient(): Resend | null {
  if (client) return client;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  client = new Resend(apiKey);
  return client;
}

// Shipping updates (shipped, in transit, out for delivery, delivered) are
// sent by Delhivery's customer-communication system directly — Aarna does not
// duplicate them. The templates below are the only emails Aarna sends.
export type EmailTemplateKey =
  | "verify_email"
  | "password_reset"
  | "order_receipt"
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
    from: process.env.RESEND_FROM_ADDRESS ?? "Aarna <hello@shopaarna.in>",
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
    case "refund_processed":
      return refundProcessedHtml(data);
    default:
      return `<p>Message from Aarna.</p>`;
  }
}

// ── Brand tokens ─────────────────────────────────────────────────────────────
const MAROON = "#4B1323";
const GOLD = "#C9A063";
const GOLD_SOFT = "#B8935A";
const CREAM = "#FAF7F2";
const INK = "#3D3A38";
const MUTE = "#A89E96";
const HAIRLINE = "#EADFD4";
const BODY_TEXT = "#6B635D";
const CARD_BG = "#FFFFFF";
const DETAILS_BG = "#FCFAF7";
const BUTTON_TEXT = "#F3E7D3";
const SERIF = "Georgia,'Times New Roman',serif";

const CLD = "https://res.cloudinary.com/dnlzgwzeo/image/upload";
const LOGO_GOLD = `${CLD}/f_png,w_460/aarna/brand/logo-gold-horizontal.png`;
const MARK_MAROON = `${CLD}/f_png,w_120/aarna/brand/mark-maroon.png`;

// ── Dark-mode lockdown ───────────────────────────────────────────────────────
//
// Mobile mail apps (Gmail Android/iOS, Outlook.com/Windows Mail, some Apple
// Mail configurations) apply their own automatic dark-mode colour inversion
// to HTML email — separately from the CSS "dark mode" a browser would apply,
// and much less predictable. Two failure modes specifically:
//   1. A client flips a light `background` to dark but leaves inherited
//      text colour untouched (or vice-versa), since our inline styles only
//      set background OR colour on some elements, relying on inheritance for
//      the other — producing invisible/low-contrast text.
//   2. Some clients auto-invert near-black brand colours (our maroon is close
//      to black) assuming they were meant for a white canvas, which fights
//      with an already-explicit background and can invert a legible
//      maroon-on-cream pairing into an illegible one.
// The standard fix (same approach Klaviyo/Mailchimp/Shopify's own
// transactional templates use) is to opt out of automatic inversion
// entirely via the color-scheme meta tags AND back that up with a real
// `prefers-color-scheme: dark` media query (plus Outlook.com's proprietary
// `[data-ogsc]`/`[data-ogsb]` hooks) that forcibly re-asserts the exact same
// light-mode colours with !important — belt and suspenders, since not every
// client honours the meta tags alone. Every colour reasserted below reads
// from the same brand-token consts as the inline styles, so the two can
// never drift out of sync.
const DARK_MODE_LOCK_CSS = `
  :root { color-scheme: light; supported-color-schemes: light; }
  @media (prefers-color-scheme: dark) {
    .e-bg { background-color: ${CREAM} !important; }
    .e-card { background-color: ${CARD_BG} !important; color: ${INK} !important; }
    .e-header { background-color: ${MAROON} !important; }
    .e-seam { background-color: ${GOLD} !important; }
    .e-footer { background-color: ${CREAM} !important; color: ${INK} !important; }
    .e-h1 { color: ${MAROON} !important; }
    .e-bar { background-color: ${GOLD} !important; }
    .e-lead { color: ${BODY_TEXT} !important; }
    .e-body { color: ${BODY_TEXT} !important; }
    .e-muted { color: ${MUTE} !important; }
    .e-link { color: ${GOLD_SOFT} !important; }
    .e-details { background-color: ${DETAILS_BG} !important; border-color: ${HAIRLINE} !important; }
    .e-label { color: ${MUTE} !important; border-color: ${HAIRLINE} !important; }
    .e-value { color: ${INK} !important; border-color: ${HAIRLINE} !important; }
    .e-value-accent { color: ${MAROON} !important; border-color: ${GOLD} !important; }
    .e-label-accent { border-color: ${GOLD} !important; }
    .e-btn-cell { background-color: ${MAROON} !important; border-color: ${GOLD} !important; }
    .e-btn-text { color: ${BUTTON_TEXT} !important; }
    .e-code-box { background-color: ${CREAM} !important; border-color: ${GOLD} !important; }
    .e-code-text { color: ${MAROON} !important; }
    .e-brand-mark { color: ${MAROON} !important; }
  }
  [data-ogsc] .e-bg, [data-ogsb] .e-bg { background-color: ${CREAM} !important; }
  [data-ogsc] .e-card, [data-ogsb] .e-card { background-color: ${CARD_BG} !important; color: ${INK} !important; }
  [data-ogsc] .e-header, [data-ogsb] .e-header { background-color: ${MAROON} !important; }
  [data-ogsc] .e-footer, [data-ogsb] .e-footer { background-color: ${CREAM} !important; color: ${INK} !important; }
  [data-ogsc] .e-btn-cell, [data-ogsb] .e-btn-cell { background-color: ${MAROON} !important; }
  [data-ogsc] .e-btn-text, [data-ogsb] .e-btn-text { color: ${BUTTON_TEXT} !important; }
`;

// ── Shared shell ─────────────────────────────────────────────────────────────

interface ShellOptions {
  preheader?: string;
  bodyHtml: string;
}

function shell({ preheader, bodyHtml }: ShellOptions): string {
  return `<!DOCTYPE html>
<html style="color-scheme:light;supported-color-schemes:light;">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <style>${DARK_MODE_LOCK_CSS}</style>
</head>
<body class="e-bg" style="margin:0;padding:0;background:${CREAM};font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:${INK};">
  ${preheader ? `<div style="display:none;font-size:1px;color:${CREAM};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${preheader}</div>` : ""}
  <table width="100%" cellpadding="0" cellspacing="0" class="e-bg" style="background:${CREAM};padding:40px 12px;">
    <tr>
      <td align="center">
        <table width="580" cellpadding="0" cellspacing="0" class="e-card" style="width:580px;max-width:100%;background:${CARD_BG};color:${INK};border:1px solid ${HAIRLINE};">
          <!-- Header -->
          <tr>
            <td class="e-header" style="background:${MAROON};padding:34px 40px 30px;text-align:center;">
              <img src="${LOGO_GOLD}" alt="Aarna — by Arpitha Abhishek" width="210" style="display:inline-block;width:210px;max-width:64%;height:auto;border:0;" />
            </td>
          </tr>
          <!-- Gold seam -->
          <tr><td class="e-seam" style="height:3px;background:${GOLD};line-height:3px;font-size:0;">&nbsp;</td></tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px 44px;">
              ${bodyHtml}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td class="e-footer" style="padding:28px 40px 30px;background:${CREAM};color:${INK};border-top:1px solid ${HAIRLINE};text-align:center;">
              <img src="${MARK_MAROON}" alt="Aarna" width="32" style="display:inline-block;width:32px;height:auto;border:0;" />
              <p class="e-brand-mark" style="margin:10px 0 8px;font-family:${SERIF};font-size:12px;letter-spacing:4px;color:${MAROON};">AARNA</p>
              <p class="e-muted" style="margin:0;font-size:11px;color:${MUTE};line-height:1.9;">
                Aarna Label · Giri Nagar, Bengaluru · GSTIN 29ACNFA3302J1ZD<br/>
                Questions? Write to <a href="mailto:hello@shopaarna.in" class="e-link" style="color:${GOLD_SOFT};text-decoration:none;">hello@shopaarna.in</a>
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

// Serif heading with a short gold accent rule beneath it.
function heading(title: string): string {
  return `<h1 class="e-h1" style="margin:0;font-family:${SERIF};font-size:24px;font-weight:400;color:${MAROON};letter-spacing:0.3px;">${title}</h1>
    <div class="e-bar" style="width:40px;height:2px;background:${GOLD};margin:14px 0 22px;line-height:2px;font-size:0;">&nbsp;</div>`;
}

function lead(text: string): string {
  return `<p class="e-lead" style="margin:0 0 22px;font-size:15px;color:${BODY_TEXT};line-height:1.7;">${text}</p>`;
}

function bodyText(text: string): string {
  return `<p class="e-body" style="margin:0;font-size:13px;color:${BODY_TEXT};line-height:1.7;">${text}</p>`;
}

function mutedText(text: string): string {
  return `<p class="e-muted" style="margin:16px 0 0;font-size:12px;color:${MUTE};line-height:1.6;">${text}</p>`;
}

function primaryButton(label: string, href: string): string {
  return `<table align="center" cellpadding="0" cellspacing="0" style="margin:28px auto;">
    <tr>
      <td class="e-btn-cell" style="background:${MAROON};border:1px solid ${GOLD};">
        <a href="${href}" class="e-btn-text" style="display:inline-block;padding:15px 40px;font-size:12px;font-weight:600;letter-spacing:2.5px;text-transform:uppercase;color:${BUTTON_TEXT};text-decoration:none;">${label}</a>
      </td>
    </tr>
  </table>`;
}

function detailsTable(rows: string): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" class="e-details" style="border:1px solid ${HAIRLINE};background:${DETAILS_BG};margin-bottom:26px;">${rows}</table>`;
}

function detailRow(label: string, value: string, accent = false): string {
  const cell = accent
    ? `border-top:2px solid ${GOLD};`
    : `border-bottom:1px solid ${HAIRLINE};`;
  const labelClass = accent ? "e-label e-label-accent" : "e-label";
  const valueClass = accent ? "e-value-accent" : "e-value";
  const valueStyle = accent
    ? `font-size:15px;font-weight:700;text-align:right;color:${MAROON};font-family:${SERIF};`
    : `font-size:13px;font-weight:600;text-align:right;color:${INK};`;
  return `<tr>
    <td class="${labelClass}" style="padding:13px 18px;${cell}font-size:11px;color:${MUTE};letter-spacing:1.5px;">${label.toUpperCase()}</td>
    <td class="${valueClass}" style="padding:13px 18px;${cell}${valueStyle}">${value}</td>
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

  const table = detailsTable(`
    ${detailRow("Order Number", orderNumber)}
    ${invoiceNumber ? detailRow("Invoice", invoiceNumber) : ""}
    ${detailRow("Total Paid", total, true)}
  `);

  return shell({
    preheader: `Order ${orderNumber} confirmed — your invoice is attached.`,
    bodyHtml: `
      ${heading("Thank you for your order")}
      ${lead("Your order is confirmed and being prepared with care. We'll let you know the moment it's on its way.")}
      ${table}
      ${bodyText(`Your tax invoice is attached as a PDF. You can view your order anytime at
        <a href="https://shopaarna.in/account" class="e-link" style="color:${GOLD_SOFT};text-decoration:none;">shopaarna.in/account</a>.`)}
    `,
  });
}

// ── Verify email ─────────────────────────────────────────────────────────────

function verifyEmailHtml(data: Record<string, unknown>): string {
  const name = (data.name as string | undefined) ?? "there";
  const verifyUrl = (data.verifyUrl as string | undefined) ?? "https://shopaarna.in";
  const code = data.code as string | undefined;

  // Big prominent code block — for the OTP login flow. Falls back to the link
  // button below for signup confirmation flows that don't include a code.
  const codeBlock = code
    ? `
      ${lead(`Hi ${escapeHtml(name)}, use this code to sign in to Aarna. It expires in 60 minutes.`)}
      <table align="center" cellpadding="0" cellspacing="0" style="margin:28px auto;">
        <tr>
          <td class="e-code-box" style="padding:22px 32px;border:1px solid ${GOLD};background:${CREAM};">
            <p class="e-code-text" style="margin:0;font-family:${SERIF};font-size:34px;font-weight:400;letter-spacing:10px;color:${MAROON};text-align:center;">${escapeHtml(code)}</p>
          </td>
        </tr>
      </table>
      <p class="e-muted" style="margin:20px 0 0;font-size:12px;color:${MUTE};line-height:1.7;text-align:center;">
        If you didn't try to sign in, you can safely ignore this email.
      </p>
    `
    : `
      ${lead("Confirm your email to finish setting up your account. This link expires in 60 minutes.")}
      ${primaryButton("Confirm Email", verifyUrl)}
      ${mutedText(`If the button doesn't work, copy and paste this link into your browser:<br/>
        <a href="${verifyUrl}" class="e-link" style="color:${GOLD_SOFT};word-break:break-all;text-decoration:none;">${verifyUrl}</a>`)}
      ${mutedText("If you didn't sign up for an account, you can safely ignore this email.")}
    `;

  return shell({
    preheader: code
      ? `Your Aarna sign-in code: ${code}`
      : "Confirm your email to start shopping at Aarna.",
    bodyHtml: `
      ${heading(code ? "Sign in to Aarna" : `Welcome, ${escapeHtml(name)}`)}
      ${codeBlock}
    `,
  });
}

// ── Password reset ───────────────────────────────────────────────────────────

function passwordResetHtml(data: Record<string, unknown>): string {
  const resetUrl = (data.resetUrl as string | undefined) ?? "https://shopaarna.in";

  return shell({
    preheader: "Reset your Aarna account password.",
    bodyHtml: `
      ${heading("Reset your password")}
      ${lead("We received a request to reset the password for your Aarna account. Choose a new one below — this link is valid for the next hour.")}
      ${primaryButton("Reset Password", resetUrl)}
      ${mutedText(`If the button doesn't work, copy and paste this link into your browser:<br/>
        <a href="${resetUrl}" class="e-link" style="color:${GOLD_SOFT};word-break:break-all;text-decoration:none;">${resetUrl}</a>`)}
      ${mutedText("If you didn't request this, ignore this email — your password stays unchanged.")}
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

  const table = detailsTable(`
    ${detailRow("Order Number", orderNumber)}
    ${detailRow("Refund Method", paymentMethod)}
    ${detailRow("Expected By", expectedDays)}
    ${refundAmountStr ? detailRow("Refund Amount", refundAmountStr, true) : ""}
  `);

  return shell({
    preheader: `Refund of ${refundAmountStr} processed for order ${orderNumber}.`,
    bodyHtml: `
      ${heading("Your refund is on its way")}
      ${lead(`We've processed your refund. It should reflect in your account within ${escapeHtml(expectedDays)}.`)}
      ${table}
      ${bodyText("If you don't see the refund after the expected window, just reply to this email and we'll help you trace it.")}
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
