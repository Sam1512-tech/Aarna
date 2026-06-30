import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
  const safeNext =
    next && next.startsWith("/") && !next.startsWith("//") ? next : "/account";
  const fallback = type === "recovery" ? "/reset-password" : safeNext;

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=missing_code", url));
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("[auth/callback] exchange failed:", error.message);
    return NextResponse.redirect(
      new URL("/login?error=verification_failed", url),
    );
  }

  return NextResponse.redirect(new URL(fallback, url));
}
