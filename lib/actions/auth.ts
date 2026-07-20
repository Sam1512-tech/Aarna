"use server";

import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mergeGuestCartOnLogin } from "@/lib/actions/cart";
import { ActionError } from "@/lib/action-error";

const { customers, admins } = schema;

export interface SignupInput {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
  whatsappOptIn?: boolean;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthResult {
  ok: boolean;
  message?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function passwordPolicyError(password: string): string | null {
  if (password.length < 8) return "Password must be at least 8 characters";
  return null;
}

// ── Public actions ───────────────────────────────────────────────────────────

export async function signup(input: SignupInput): Promise<AuthResult> {
  const email = normalizeEmail(input.email);
  const fullName = input.fullName.trim();

  if (!email || !fullName) {
    return { ok: false, message: "Name and email are required" };
  }
  const passErr = passwordPolicyError(input.password);
  if (passErr) return { ok: false, message: passErr };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password: input.password,
    options: {
      data: { full_name: fullName, phone: input.phone ?? null },
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
    },
  });

  if (error) return { ok: false, message: error.message };
  if (!data.user) return { ok: false, message: "Signup failed — please try again" };

  // Mirror the Supabase auth user into our customers table.
  // Using onConflictDoNothing in case the user re-signs-up (e.g., didn't verify first time).
  await db
    .insert(customers)
    .values({
      id: data.user.id,
      email,
      fullName,
      phone: input.phone ?? null,
      whatsappOptIn: input.whatsappOptIn ?? false,
    })
    .onConflictDoNothing();

  return {
    ok: true,
    message: "Check your inbox — we've sent you a verification email.",
  };
}

export async function login(input: LoginInput): Promise<AuthResult> {
  const email = normalizeEmail(input.email);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: input.password,
  });

  if (error) {
    // Don't leak whether the email exists
    return { ok: false, message: "Invalid email or password" };
  }
  if (!data.user) return { ok: false, message: "Login failed" };

  // Defensive: if customer row was never created (edge case from older accounts), create it now.
  await db
    .insert(customers)
    .values({
      id: data.user.id,
      email,
      fullName: (data.user.user_metadata?.full_name as string) ?? "",
      whatsappOptIn: false,
    })
    .onConflictDoNothing();

  // Merge guest cart from cookie into the user's cart
  await mergeGuestCartOnLogin().catch(() => {
    // Cart merge failure shouldn't block login
  });

  return { ok: true };
}

export async function logout(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
}

export async function requestPasswordReset(email: string): Promise<AuthResult> {
  const normalized = normalizeEmail(email);
  if (!normalized) return { ok: false, message: "Email is required" };

  // Route through /auth/callback (not directly to /reset-password) — Supabase's
  // recovery link carries a PKCE ?code=... that must be exchanged for a session
  // before /reset-password's updatePassword() call has anything to act on.
  // /auth/callback already forwards type=recovery here after the exchange.
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(normalized, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/reset-password`,
  });

  // Always return ok regardless — don't leak whether the email is registered
  if (error) {
    console.error("[auth] reset password error:", error.message);
  }

  return {
    ok: true,
    message:
      "If that email is registered, we've sent a reset link. Please check your inbox.",
  };
}

export async function updatePassword(newPassword: string): Promise<AuthResult> {
  const passErr = passwordPolicyError(newPassword);
  if (passErr) return { ok: false, message: passErr };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password: newPassword });

  if (error) {
    // No active session (link expired, already used, or too much time passed
    // since the recovery redirect) — Supabase's raw "Auth session missing!"
    // means nothing to a customer; point them back to request a fresh link.
    if (/session/i.test(error.message)) {
      return {
        ok: false,
        message: "This reset link has expired. Please request a new one.",
      };
    }
    return { ok: false, message: error.message };
  }
  return { ok: true, message: "Password updated" };
}

export async function getCurrentCustomer() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;

  const customer = await db
    .select()
    .from(customers)
    .where(eq(customers.id, data.user.id))
    .limit(1);

  return customer[0] ?? null;
}

/**
 * Returns the current admin row, or null if not logged in or not an admin.
 */
export async function getCurrentAdmin() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;

  const admin = await db
    .select()
    .from(admins)
    .where(eq(admins.id, data.user.id))
    .limit(1);

  return admin[0] ?? null;
}

/**
 * Throws if the current user is not an admin. Use in admin server actions:
 *
 *   export async function createCategory(...) {
 *     await requireAdmin();
 *     // ...
 *   }
 */
export async function requireAdmin() {
  const admin = await getCurrentAdmin();
  if (!admin) throw new ActionError("Unauthorized — admin access required");
  return admin;
}

// ── Email OTP flow ───────────────────────────────────────────────────────────

/**
 * Sends a one-time login code to the given email. Uses Supabase Auth's OTP
 * (magic-link with `otp` type — Supabase emails the 6-digit code, not a link,
 * when configured in the dashboard).
 *
 * If the email doesn't have a customer record yet, `shouldCreateUser: true`
 * ensures Supabase creates one — then the caller's `verifyEmailOtp` step
 * mirrors the auth user into our customers table.
 */
export async function sendEmailOtp(email: string): Promise<AuthResult> {
  const normalized = normalizeEmail(email);
  if (!normalized) return { ok: false, message: "Email is required" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return { ok: false, message: "Please enter a valid email" };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: normalized,
    options: {
      shouldCreateUser: true,
    },
  });

  if (error) {
    console.error("[auth] sendEmailOtp error:", error.message);
    // Generic response — don't leak whether the email is registered
    return { ok: true, message: "Check your inbox — we've sent you a login code." };
  }

  return { ok: true, message: "Check your inbox — we've sent you a login code." };
}

export interface VerifyEmailOtpInput {
  email: string;
  code: string;
  /** Optional — only used when creating a new customer on first-time verify */
  fullName?: string;
}

/**
 * Verifies the OTP code the user typed. On success:
 *  - Supabase auth session is established (cookies set via SSR client)
 *  - customer row is created if this is a first-time login
 *  - guest cart is merged into the user's cart
 */
export async function verifyEmailOtp(input: VerifyEmailOtpInput): Promise<AuthResult> {
  const email = normalizeEmail(input.email);
  const code = input.code.trim();

  if (!email || !code) {
    return { ok: false, message: "Email and code are required" };
  }
  if (!/^\d{6}$/.test(code)) {
    return { ok: false, message: "Enter the 6-digit code" };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token: code,
    type: "email",
  });

  if (error || !data.user) {
    return { ok: false, message: "Invalid or expired code" };
  }

  // Mirror the auth user into customers on first verify. onConflictDoNothing
  // makes re-logins a no-op.
  await db
    .insert(customers)
    .values({
      id: data.user.id,
      email,
      fullName: input.fullName?.trim() || (data.user.user_metadata?.full_name as string) || "",
      whatsappOptIn: false,
    })
    .onConflictDoNothing();

  // Best-effort cart merge — don't block login on failure
  await mergeGuestCartOnLogin().catch(() => undefined);

  return { ok: true };
}
