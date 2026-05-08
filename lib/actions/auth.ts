"use server";

export interface SignupInput {
  email: string;
  password: string;
  fullName: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthResult {
  ok: boolean;
  message?: string;
}

export async function signup(_input: SignupInput): Promise<AuthResult> {
  // TODO(backend): supabase.auth.signUp + insert customer row + send verify email via Resend.
  return { ok: false, message: "Not implemented" };
}

export async function login(_input: LoginInput): Promise<AuthResult> {
  // TODO(backend): supabase.auth.signInWithPassword + merge guest cart.
  return { ok: false, message: "Not implemented" };
}

export async function logout(): Promise<void> {
  // TODO(backend): supabase.auth.signOut + clear cookies.
}

export async function requestPasswordReset(_email: string): Promise<AuthResult> {
  // TODO(backend): supabase.auth.resetPasswordForEmail.
  return { ok: false, message: "Not implemented" };
}
