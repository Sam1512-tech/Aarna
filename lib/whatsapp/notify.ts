import { db, schema } from "@/lib/db";
import { sendTemplate, type WhatsappTemplateKey } from "@/lib/whatsapp";

const { messageLog } = schema;

export interface WhatsAppNotifyInput {
  orderId: string;
  phone: string;
  whatsappOptIn: boolean;
  templateKey: WhatsappTemplateKey;
  bodyValues: string[];
}

/**
 * Sends a transactional WhatsApp for an order event and logs it to message_log.
 * Respects the customer's WhatsApp opt-in. Never throws — a notification failure
 * must never break the webhook/action that triggered it.
 */
export async function notifyWhatsApp(input: WhatsAppNotifyInput): Promise<void> {
  try {
    if (!input.whatsappOptIn) return; // customer didn't opt in to WhatsApp

    const result = await sendTemplate({
      phone: input.phone,
      templateKey: input.templateKey,
      bodyValues: input.bodyValues,
    });

    if (result.skipped) return; // BSP not configured yet — nothing to log

    // A failed send is non-blocking by design (never breaks the webhook/
    // action that triggered it — see the docstring above), but a failure
    // that only ever shows up as a message_log row nobody's looking at is
    // effectively invisible. This was exactly how the "delivered" template's
    // body-value-count drift (2026-07-26 — Interakt's live template had
    // been edited to 2 vars, code still sent 3) went unnoticed: every
    // attempt failed, silently, with a real, specific error from Interakt
    // sitting unread in the DB. Log a greppable line on every failure so
    // this class of bug surfaces in server logs, not just on-demand DB
    // queries.
    if (!result.ok) {
      console.error(
        `[whatsapp] send failed — template=${input.templateKey} order=${input.orderId} to=${input.phone}: ${result.error}`,
      );
    }

    await db.insert(messageLog).values({
      channel: "whatsapp",
      toAddress: input.phone,
      templateKey: input.templateKey,
      status: result.ok ? "sent" : "failed",
      providerMessageId: result.providerMessageId ?? null,
      payload: { bodyValues: input.bodyValues },
      errorMessage: result.error ?? null,
      orderId: input.orderId,
    });
  } catch (err) {
    console.error("[whatsapp] notify failed:", err);
  }
}

/** First name from an order's shipping address (for template personalisation). */
export function firstNameFromAddress(shippingAddress: unknown): string {
  const full = (shippingAddress as { fullName?: string } | null)?.fullName ?? "";
  return full.trim().split(/\s+/)[0] || "there";
}

/** ₹ amount formatting from paise (no symbol — templates carry the ₹). */
export function rupees(paise: number): string {
  return (paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}
