import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "node:crypto";

// Capture what the route hands to sendEmail without actually sending.
interface SendEmailArg {
  to: string;
  subject: string;
  templateKey: string;
  data: Record<string, unknown>;
}
const sendEmail = vi.fn(async (_arg: SendEmailArg) => {});
vi.mock("@/lib/resend", () => ({
  sendEmail: (arg: SendEmailArg) => sendEmail(arg),
}));

const SECRET = "whsec_" + Buffer.from("test-signing-key-0123456789").toString("base64");

function signedRequest(actionType: string, token = "123456"): Request {
  const id = "msg_test";
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const body = JSON.stringify({
    user: { email: "person@example.com", user_metadata: { full_name: "Test Person" } },
    email_data: {
      token,
      token_hash: "hash_xyz",
      email_action_type: actionType,
      redirect_to: "https://shopaarna.in/auth/callback",
      site_url: "https://shopaarna.in",
    },
  });
  const key = Buffer.from(SECRET.replace(/^(v1,)?whsec_/, ""), "base64");
  const sig = crypto.createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64");
  return new Request("http://localhost/api/auth/email-hook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "webhook-id": id,
      "webhook-timestamp": timestamp,
      "webhook-signature": `v1,${sig}`,
    },
    body,
  });
}

describe("supabase email hook — action-type routing", () => {
  beforeEach(() => {
    sendEmail.mockClear();
    process.env.SUPABASE_AUTH_HOOK_SECRET = SECRET;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://proj.supabase.co";
  });
  afterEach(() => vi.resetModules());

  it("signup → confirm-email template, no OTP code, confirm subject", async () => {
    const { POST } = await import("./route");
    const res = await POST(signedRequest("signup"));
    expect(res.status).toBe(200);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const arg = sendEmail.mock.calls[0][0];
    expect(arg.subject).toBe("Confirm your email — Aarna");
    expect(arg.templateKey).toBe("verify_email");
    // The bug being guarded: signup must NOT carry `code`, or the template
    // renders the giant OTP block and the email reads "your login code".
    expect(arg.data.code).toBeUndefined();
    expect(arg.data.verifyUrl).toContain("/auth/v1/verify");
  });

  it("magiclink → OTP code template with login-code subject", async () => {
    const { POST } = await import("./route");
    const res = await POST(signedRequest("magiclink"));
    expect(res.status).toBe(200);
    const arg = sendEmail.mock.calls[0][0];
    expect(arg.subject).toBe("Your Aarna login code: 123456");
    expect(arg.data.code).toBe("123456");
  });

  it("recovery → password-reset template", async () => {
    const { POST } = await import("./route");
    const res = await POST(signedRequest("recovery"));
    expect(res.status).toBe(200);
    const arg = sendEmail.mock.calls[0][0];
    expect(arg.subject).toBe("Reset your password — Aarna");
    expect(arg.templateKey).toBe("password_reset");
  });

  it("rejects an unsigned request with 401", async () => {
    const { POST } = await import("./route");
    const bad = new Request("http://localhost/api/auth/email-hook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    const res = await POST(bad);
    expect(res.status).toBe(401);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
