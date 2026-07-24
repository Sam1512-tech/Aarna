import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { db, schema } from "@/lib/db";
import { mergeGuestCartOnLogin } from "@/lib/actions/cart";

const { customers } = schema;

/**
 * Supabase email-confirmation and OAuth callbacks land here with a ?code=...
 * query param. We exchange the code for a session (which sets the auth
 * cookies), then redirect to ?next= or /account by default.
 *
 * When `type=recovery` (Supabase's password reset flow), we forward to
 * /reset-password instead so the user can choose a new one.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const type = url.searchParams.get("type");
  const next = url.searchParams.get("next");

  // Only allow same-origin relative redirects, defaulting to /account.
  const safeNext = safeRedirectPath(next, "/account");
  const fallback = type === "recovery" ? "/reset-password" : safeNext;

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=missing_code", url));
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("[auth/callback] exchange failed:", error.message);
    return NextResponse.redirect(
      new URL("/login?error=verification_failed", url),
    );
  }

  // Email/password signup already creates this row (lib/actions/auth.ts,
  // signup()), so this is a no-op there. But Google/OAuth sign-in never
  // goes through signup() or login() at all — it lands here directly with
  // nothing else ever creating a customers row for a first-time OAuth user.
  // Without this, exchangeCodeForSession above succeeds (real Supabase
  // session, real cookie) but getCurrentCustomer() then finds no matching
  // row and returns null, so every page gated on "is there a customer"
  // behaves as if signed out — with no error, just a blank/broken page.
  // Confirmed live: the one account that appeared to "work" was the one
  // with a customers row from unrelated prior testing; every other Google
  // account hit exactly this gap.
  if (data.user) {
    await db
      .insert(customers)
      .values({
        id: data.user.id,
        email: data.user.email ?? "",
        fullName: (data.user.user_metadata?.full_name as string) ?? "",
        whatsappOptIn: false,
      })
      .onConflictDoNothing();

    await mergeGuestCartOnLogin().catch(() => {
      // Cart merge failure shouldn't block sign-in
    });
  }

  return NextResponse.redirect(new URL(fallback, url));
}
