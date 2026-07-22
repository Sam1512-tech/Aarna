import { Resend } from "resend";
import { db, schema } from "@/lib/db";

const { admins } = schema;

let client: Resend | null = null;

function getResendClient(): Resend | null {
  if (client) return client;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  client = new Resend(apiKey);
  return client;
}

/**
 * Emails every registered admin about a security-relevant event (a rate
 * limit actually tripping — see checkRateLimit's alertLabel option).
 *
 * Deliberately separate from lib/resend/index.ts's sendEmail(): that
 * function's EmailTemplateKey union is scoped to the 4 branded
 * customer-facing templates by design (see CLAUDE.md's "customer
 * communication split"). This is an internal ops notification, not a
 * customer touchpoint, so it uses its own plain-text-style email rather
 * than stretching the branded template system to cover a different kind
 * of message.
 *
 * Best-effort: swallows its own errors (logged, not thrown) so a failed
 * alert email can never break the request that triggered it.
 */
export async function alertAdminSuspiciousActivity(context: {
  event: string;
  detail: string;
}): Promise<void> {
  try {
    const resend = getResendClient();
    if (!resend) {
      console.warn("[alert-admin] RESEND_API_KEY not set — alert not sent:", context.event);
      return;
    }

    const recipients = await db.select({ email: admins.email }).from(admins);
    if (recipients.length === 0) return;

    await resend.emails.send({
      from: process.env.RESEND_FROM_ADDRESS ?? "Aarna <hello@shopaarna.in>",
      to: recipients.map((r) => r.email),
      subject: `[Aarna security] ${context.event}`,
      html: `
        <p><strong>${escapeHtml(context.event)}</strong></p>
        <p>${escapeHtml(context.detail)}</p>
        <p style="color:#888;font-size:12px;">Automated security alert from shopaarna.in.</p>
      `,
    });
  } catch (err) {
    console.error("[alert-admin] failed to send alert:", err);
  }
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
