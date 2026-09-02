import Razorpay from "razorpay";
import crypto from "node:crypto";

let client: Razorpay | null = null;

export function getRazorpayClient(): Razorpay {
  if (client) return client;
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new Error("RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET not set.");
  }
  client = new Razorpay({ key_id: keyId, key_secret: keySecret });
  return client;
}

export interface CreateOrderInput {
  amountInPaise: number;
  receipt: string;
  notes?: Record<string, string>;
}

export async function createRazorpayOrder(input: CreateOrderInput) {
  const rp = getRazorpayClient();
  return rp.orders.create({
    amount: input.amountInPaise,
    currency: "INR",
    receipt: input.receipt,
    notes: input.notes,
  });
}

export function verifyWebhookSignature(
  rawBody: string,
  signature: string,
): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) throw new Error("RAZORPAY_WEBHOOK_SECRET not set.");
  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");
  // timingSafeEqual throws (RangeError) when the two buffers differ in
  // length instead of returning false — an attacker sending a
  // wrong-length signature (truncated header, probe, scanner) must get
  // the same clean "invalid" result as a wrong-value one, not an
  // unhandled exception. See lib/whatsapp/index.ts's
  // verifyDeliveryWebhook for the identical pattern.
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(signature),
    );
  } catch {
    return false;
  }
}

export function verifyPaymentSignature(params: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}): boolean {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) throw new Error("RAZORPAY_KEY_SECRET not set.");
  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${params.razorpayOrderId}|${params.razorpayPaymentId}`)
    .digest("hex");
  try {
    // timingSafeEqual throws RangeError on a length mismatch rather than
    // returning false — a malformed/truncated razorpay_signature on the
    // payment-success callback must fail closed cleanly, not crash. Mirrors
    // the identical guard already used by the WhatsApp webhook's signature
    // check (lib/whatsapp/index.ts).
    return crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(params.razorpaySignature),
    );
  } catch {
    return false;
  }
}

export async function createRefund(
  paymentId: string,
  amountInPaise: number,
  notes?: Record<string, string>,
) {
  const rp = getRazorpayClient();
  return rp.payments.refund(paymentId, {
    amount: amountInPaise,
    notes,
  });
}

/**
 * The Node SDK doesn't throw a real `Error` on an API-level rejection — it
 * throws a plain object shaped `{ statusCode, error: { code, description,
 * ... } }` (confirmed by reading node_modules/razorpay/dist/api.js's
 * `normalizeError`, not guessed). That plain object has no `.message`, so it
 * can't be told apart from a genuinely unexpected failure by callers that
 * only check `instanceof Error` — this narrows the specific shape so a
 * caller can recover Razorpay's own human-readable rejection reason
 * (e.g. "The refund amount exceeds the amount that could be refunded")
 * instead of it silently becoming an undiagnosable generic error. Returns
 * undefined for anything that doesn't match — a real network failure, a
 * timeout, or any other shape stays exactly as unrecognized/masked as it is
 * today; only a genuine Razorpay API rejection is affected.
 */
export function razorpayApiErrorDetail(
  err: unknown,
): { code?: string; description: string } | undefined {
  if (typeof err !== "object" || err === null || !("error" in err)) {
    return undefined;
  }
  const inner = (err as { error: unknown }).error;
  if (typeof inner !== "object" || inner === null) return undefined;
  const description = (inner as { description?: unknown }).description;
  if (typeof description !== "string") return undefined;
  const code = (inner as { code?: unknown }).code;
  return { code: typeof code === "string" ? code : undefined, description };
}

/**
 * Real order status straight from Razorpay — used by the stale-order cleanup
 * cron to double-check a "pending"/"failed" order in our own DB wasn't
 * actually paid before permanently deleting it (e.g. a payment.captured
 * webhook that never landed). "paid" means Razorpay genuinely captured
 * money against this order, regardless of what our own paymentStatus says.
 */
export async function fetchRazorpayOrderStatus(
  razorpayOrderId: string,
): Promise<{ status: "created" | "attempted" | "paid"; amountPaid: number }> {
  const rp = getRazorpayClient();
  const order = await rp.orders.fetch(razorpayOrderId);
  return { status: order.status, amountPaid: Number(order.amount_paid ?? 0) };
}
