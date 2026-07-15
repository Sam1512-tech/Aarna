import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { sendEmail, type EmailTemplateKey } from "@/lib/resend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Supabase Auth "Send Email" hook. Configure it in the Supabase dashboard
// (Authentication → Hooks → Send Email → HTTPS) pointing at this route, with the
// generated signing secret in SUPABASE_AUTH_HOOK_SECRET. Supabase then calls this
// for every auth email (signup confirmation, password recovery, etc.) instead of
// sending its own — so they all use Aarna's branded Resend templates.

interface EmailHookPayload {
  user: { email: string; user_metadata?: { full_name?: string | null } };
  email_data: {
    token: string; // 6-digit OTP code the user types into the login form
    token_hash: string; // hash used by /auth/v1/verify link flow
    email_action_type: string; // signup | recovery | magiclink | email | email_change | invite
    redirect_to: string;
    site_url: string;
  };
}

// Standard Webhooks signature verification (the scheme Supabase Auth hooks use).
function verifySignature(secret: string, headers: Headers, body: string): boolean {
  const id = headers.get("webhook-id");
  const timestamp = headers.get("webhook-timestamp");
  const sigHeader = headers.get("webhook-signature");
  if (!id || !timestamp || !sigHeader) return false;

  // Secret looks like "v1,whsec_<base64>"; the signing key is the base64 part.
  const key = Buffer.from(secret.replace(/^(v1,)?whsec_/, ""), "base64");
  const expected = crypto
    .createHmac("sha256", key)
    .update(`${id}.${timestamp}.${body}`)
    .digest("base64");

  // webhook-signature is a space-delimited list of "v<version>,<base64sig>".
  for (const part of sigHeader.split(" ")) {
    const sig = part.split(",")[1] ?? part;
    if (
      sig.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
    ) {
      return true;
    }
  }
  return false;
}

export async function POST(req: Request): Promise<Response> {
  const secret = process.env.SUPABASE_AUTH_HOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "hook secret not configured" }, { status: 500 });
  }

  const body = await req.text();
  if (!verifySignature(secret, req.headers, body)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let payload: EmailHookPayload;
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }

  const { user, email_data } = payload;
  const type = email_data.email_action_type;
  const name = user.user_metadata?.full_name ?? "there";

  // The verification/action link the customer clicks. Supabase verifies the
  // token_hash at its own /auth/v1/verify endpoint, then redirects to redirect_to.
  const actionUrl =
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/verify` +
    `?token=${email_data.token_hash}` +
    `&type=${type}` +
    `&redirect_to=${encodeURIComponent(email_data.redirect_to)}`;

  let templateKey: EmailTemplateKey;
  let subject: string;
  let data: Record<string, unknown>;

  switch (type) {
    case "recovery":
      templateKey = "password_reset";
      subject = "Reset your password — Aarna";
      data = { resetUrl: actionUrl };
      break;
    case "signup":
    case "email":
    case "magiclink":
    default:
      // "email" / "magiclink" fire from supabase.auth.signInWithOtp — the user
      // types the 6-digit token into the login form. Include both the code and
      // the fallback link so the same email works either way.
      if (email_data.token.length !== 6) {
        // Supabase's OTP length is a project-level dashboard setting
        // (Authentication → Sign In / Providers → Email → OTP Length),
        // independent of this code — if it ever drifts again, the login
        // form's 6-box input silently can't fit the code. Log the length
        // only, never the code itself.
        console.warn(
          `[supabase email hook] OTP length is ${email_data.token.length}, expected 6 — check Supabase dashboard OTP Length setting`,
        );
      }
      templateKey = "verify_email";
      subject = `Your Aarna login code: ${email_data.token}`;
      data = { name, verifyUrl: actionUrl, code: email_data.token };
      break;
  }

  try {
    await sendEmail({ to: user.email, subject, templateKey, data });
  } catch (err) {
    console.error("[supabase email hook] send failed:", err);
    return NextResponse.json({ error: "email send failed" }, { status: 500 });
  }

  return NextResponse.json({});
}
