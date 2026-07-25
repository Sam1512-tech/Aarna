"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

interface GoogleSignInButtonProps {
  /** Where to land the user after the OAuth round-trip. Passed through the
   *  existing /auth/callback route as ?next=. */
  nextPath: string;
  /** Optional label override — defaults to "continue with google". */
  label?: string;
  /** Disable externally (e.g. when another form on the same page is pending). */
  disabled?: boolean;
  onError?: (message: string) => void;
}

/**
 * "Continue with Google" button — same style used across /login, /signup and
 * /login/otp. Wraps supabase.auth.signInWithOAuth so the whole OAuth path lives
 * in one place. The /auth/callback route already handles the code exchange.
 */
export function GoogleSignInButton({
  nextPath,
  label = "Continue with Google",
  disabled = false,
  onError,
}: GoogleSignInButtonProps) {
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setPending(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
        },
      });
      if (error) {
        onError?.("Couldn't open Google sign-in. Please try again.");
        setPending(false);
      }
      // On success supabase performs a top-level navigation to Google — no
      // need to reset pending on the happy path.
    } catch {
      onError?.("Couldn't open Google sign-in. Please try again.");
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || pending}
      className="group/g flex min-h-[52px] w-full items-center justify-center gap-3 rounded-2xl border border-cocoa/22 bg-cream px-6 shadow-[0_10px_28px_rgba(43,38,35,0.04)] transition duration-500 hover:border-cocoa hover:shadow-[0_14px_34px_rgba(43,38,35,0.08)] disabled:opacity-50"
    >
      <GoogleGlyph />
      <span className="text-[12px] font-medium uppercase tracking-[0.18em] text-charcoal/85">
        {label}
      </span>
    </button>
  );
}

/** Google's official multi-colour "G" glyph. */
function GoogleGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C4 20.98 7.7 23 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 4 3.02 2.18 6.07l3.66 2.84C6.71 6.31 9.14 5.38 12 5.38Z"
      />
    </svg>
  );
}
