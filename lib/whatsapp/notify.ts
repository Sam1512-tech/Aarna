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
