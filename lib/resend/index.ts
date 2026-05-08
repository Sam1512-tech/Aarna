import { Resend } from "resend";

let client: Resend | null = null;

export function getResendClient(): Resend {
  if (client) return client;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY not set.");
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

export async function sendEmail(_input: SendEmailInput) {
  // TODO(backend): render React Email component for templateKey, send via resend.emails.send,
  // log into message_log.
  throw new Error("sendEmail not yet implemented.");
}
