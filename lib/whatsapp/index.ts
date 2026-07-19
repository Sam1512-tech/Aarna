// WhatsApp Business API via Interakt (BSP).
// Auth: Interakt issues a ready-to-use Basic token — pass it as `Basic <key>`.
//
// Scope: WhatsApp sends KEY MILESTONES ONLY. Shipping-in-progress updates
// (shipped / out for delivery / in transit) are owned by Delhivery's own
// customer comms — we don't duplicate them. See docs/whatsapp-templates.md.
//
// Templates (all need Meta approval, 1–7 day cycle):
//   order_placed, delivered, return_received, refund_processed,
//   return_requested, return_approved, return_rejected, return_qc_failed

import crypto from "node:crypto";

export type WhatsappTemplateKey =
  | "order_placed"
  | "delivered"
  | "return_received"
  | "refund_processed"
  | "return_requested"
  | "return_approved"
  | "return_rejected"
  | "return_qc_failed";

const DEFAULT_BASE = "https://api.interakt.ai/v1/public";

export interface SendTemplateInput {
  /** Recipient phone in any common Indian format; normalised internally. */
  phone: string;
  templateKey: WhatsappTemplateKey;
  /** Ordered body variable values, matching {{1}}, {{2}}… in the template. */
  bodyValues: string[];
  languageCode?: string; // default "en"
}

export interface SendTemplateResult {
  ok: boolean;
  skipped?: boolean; // true when WhatsApp isn't configured yet (pre-BSP)
  providerMessageId?: string;
  error?: string;
}

/** Normalise an Indian phone to { countryCode, phoneNumber }. Null if unusable. */
export function normalizeIndianPhone(
  raw: string,
): { countryCode: string; phoneNumber: string } | null {
  const digits = raw.replace(/\D/g, "");
  let local = digits;
  if (local.length === 12 && local.startsWith("91")) local = local.slice(2);
  if (local.length === 11 && local.startsWith("0")) local = local.slice(1);
  if (local.length !== 10) return null;
  return { countryCode: "+91", phoneNumber: local };
}

/**
 * Sends a pre-approved WhatsApp template via Interakt.
 * Never throws. Graceful no-op (skipped) until WHATSAPP_API_KEY is configured,
 * so callers can be wired now and start working the moment the BSP is live.
 */
export async function sendTemplate(
  input: SendTemplateInput,
): Promise<SendTemplateResult> {
  const apiKey = process.env.WHATSAPP_API_KEY;
  if (!apiKey) {
    console.warn(
      `[whatsapp] WHATSAPP_API_KEY not set — skipped ${input.templateKey} to ${input.phone}`,
    );
    return { ok: false, skipped: true };
  }

  const phone = normalizeIndianPhone(input.phone);
  if (!phone) return { ok: false, error: `invalid phone: ${input.phone}` };

  const base = (process.env.WHATSAPP_API_BASE_URL || DEFAULT_BASE).replace(/\/$/, "");

  try {
    const res = await fetch(`${base}/message/`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        countryCode: phone.countryCode,
        phoneNumber: phone.phoneNumber,
        type: "Template",
        template: {
          name: input.templateKey,
          languageCode: input.languageCode ?? "en",
          bodyValues: input.bodyValues,
        },
      }),
    });

    const json = (await res.json().catch(() => ({}))) as {
      result?: boolean;
      id?: string;
      message?: string;
    };

    if (!res.ok || json.result === false) {
      return { ok: false, error: json.message ?? `HTTP ${res.status}` };
    }
    return { ok: true, providerMessageId: json.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Verifies an Interakt delivery/read-receipt webhook with a shared secret.
 * When WHATSAPP_WEBHOOK_SECRET is set, requires a matching HMAC-SHA256 of the
 * raw body. Until then it accepts unauthenticated requests (pre-BSP secret) —
 * intentional so the endpoint keeps working before Interakt issues one, but
 * this means `true` here does NOT mean "verified", just "not rejected". Any
 * future logic that trusts the payload (e.g. the message_log persistence
 * TODO in app/api/webhooks/whatsapp/route.ts) must not treat an unsigned
 * request as more trustworthy than it is. Confirm Interakt's exact signing
 * scheme when wiring the live secret.
 */
export function verifyDeliveryWebhook(rawBody: string, signature: string): boolean {
  const secret = process.env.WHATSAPP_WEBHOOK_SECRET;
  if (!secret) {
    console.warn(
      "[whatsapp webhook] WHATSAPP_WEBHOOK_SECRET not set — accepting request WITHOUT signature verification.",
    );
    return true;
  }
  if (!signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}
