// WhatsApp Business API via BSP (Interakt or AiSensy).
// The exact REST shape depends on the BSP chosen — fill in once selected.
//
// Required templates (all need Meta approval, 1–7 day cycle):
//   order_placed, order_shipped, out_for_delivery, delivered, return_received, refund_processed

export type WhatsappTemplateKey =
  | "order_placed"
  | "order_shipped"
  | "out_for_delivery"
  | "delivered"
  | "return_received"
  | "refund_processed";

export interface SendTemplateInput {
  toPhone: string;
  templateKey: WhatsappTemplateKey;
  variables: Record<string, string>;
  // Some templates carry a tracking URL or button payload.
  buttonUrl?: string;
}

export async function sendTemplate(_input: SendTemplateInput) {
  const apiKey = process.env.WHATSAPP_API_KEY;
  const baseUrl = process.env.WHATSAPP_API_BASE_URL;
  if (!apiKey || !baseUrl) {
    throw new Error("WHATSAPP_API_KEY / WHATSAPP_API_BASE_URL not set.");
  }
  // TODO(backend): implement against chosen BSP (Interakt vs AiSensy).
  // - POST /campaigns/notification with template name + variables.
  // - Persist provider_message_id into message_log row.
  throw new Error("WhatsApp sendTemplate not yet implemented.");
}

export function verifyDeliveryWebhook(_rawBody: string, _signature: string) {
  // TODO(backend): some BSPs sign webhooks; others rely on a shared secret in headers.
  return true;
}
