"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Mail, ShieldCheck } from "lucide-react";
import {
  forwardRef,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react";
import { sendEmailOtp, verifyEmailOtp } from "@/lib/actions/auth";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_LENGTH = 6;

type Step = "email" | "otp";

interface LoginOtpViewProps {
  nextPath: string;
  /** Email a code was already sent to (handed off from /login) — start
      directly at the code-entry step instead of asking for the email again,
      which would force a second send straight into Supabase's 60s rate
      limit. */
  initialEmail?: string;
}

export function LoginOtpView({ nextPath, initialEmail }: LoginOtpViewProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(initialEmail ? "otp" : "email");
  const [email, setEmail] = useState(initialEmail ?? "");
  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(""));
  const [name, setName] = useState("");
  const [needsName, setNeedsName] = useState(Boolean(initialEmail));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(initialEmail ? 30 : 0);

  const emailIsValid = EMAIL_REGEX.test(email);
  const otpJoined = otp.join("");
  const otpIsValid = otpJoined.length === OTP_LENGTH && /^\d+$/.test(otpJoined);
  const nameIsValid = !needsName || name.trim().length >= 2;

  // Resend OTP countdown.
  useEffect(() => {
    if (resendCountdown <= 0) return;
    const t = window.setTimeout(
      () => setResendCountdown((c) => c - 1),
      1000,
    );
    return () => window.clearTimeout(t);
  }, [resendCountdown]);

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!emailIsValid) return;
    setError(null);
    setPending(true);
    try {
      const result = await sendEmailOtp(email);
      if (!result.ok) {
        setError(result.message ?? "Couldn't send code. Please try again.");
        return;
      }
      // We can't know from the server whether the email is a new account (to
      // avoid leaking whether an email is registered). Ask for a name if the
      // user is likely new — the server ignores it for existing accounts.
      setNeedsName(true);
      setStep("otp");
      setResendCountdown(30);
    } catch {
      setError("Couldn't send code. Please try again.");
    } finally {
      setPending(false);
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!otpIsValid || !nameIsValid) return;
    setError(null);
    setPending(true);
    try {
      const result = await verifyEmailOtp({
        email,
        code: otpJoined,
        fullName: needsName ? name.trim() : undefined,
      });
      if (!result.ok) {
        setError(result.message ?? "That code didn't work. Please try again.");
        setPending(false);
        return;
      }
      // Preserve cart and continue directly to checkout (or wherever ?next=).
      router.push(nextPath);
    } catch {
      setError("That code didn't work. Please try again.");
      setPending(false);
    }
  }

  async function handleResend() {
    if (resendCountdown > 0 || pending) return;
    setResending(true);
    setPending(true);
    setError(null);
    try {
      const result = await sendEmailOtp(email);
      if (!result.ok) {
        setError(result.message ?? "Couldn't send code. Please try again.");
        return;
      }
      setResendCountdown(30);
    } finally {
      setPending(false);
      setResending(false);
    }
  }

  function changeEmail() {
    setStep("email");
    setOtp(Array(OTP_LENGTH).fill(""));
    setError(null);
  }

  async function signInWithGoogle() {
    setError(null);
    setPending(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
        },
      });
      if (oauthError) {
        setError("Couldn't open Google sign-in. Please try again.");
        setPending(false);
      }
      // On success, supabase.auth.signInWithOAuth performs a top-level
      // navigation to Google — no need to setPending(false) on the happy path.
    } catch {
      setError("Couldn't open Google sign-in. Please try again.");
      setPending(false);
    }
  }

  return (
    <main className="paper-grain min-h-screen bg-cream px-5 py-14 md:px-6 md:py-20">
      <div className="mx-auto flex max-w-md flex-col items-center">
        <Link href="/" aria-label="Aarna home" className="flex items-center">
          <Image
            src="/brand/aarna-header-logo-transparent.png"
            alt="Aarna"
            width={180}
            height={180}
            priority
            className="logo-blend h-14 w-14 object-contain"
          />
        </Link>

        <h1 className="mt-7 font-display text-[40px] uppercase leading-[1.06] tracking-[0.02em] text-maroon md:text-5xl">
          {step === "email" ? "SIGN IN" : "CHECK YOUR EMAIL"}
        </h1>
        <p className="mt-3 max-w-xs break-words text-center text-sm leading-6 text-charcoal/60">
          {step === "email"
            ? "Enter your email — we'll send a one-time code to verify it."
            : `We sent a 6-digit code to ${email}.`}
        </p>

        {step === "email" ? (
          <div className="mt-9 w-full">
            <button
              type="button"
              onClick={signInWithGoogle}
              disabled={pending}
              className="group/g flex min-h-[52px] w-full items-center justify-center gap-3 rounded-2xl border border-cocoa/22 bg-cream px-6 shadow-[0_10px_28px_rgba(43,38,35,0.04)] transition duration-500 hover:border-cocoa hover:shadow-[0_14px_34px_rgba(43,38,35,0.08)] disabled:opacity-50"
            >
              <GoogleGlyph />
              <span className="text-[12px] font-medium uppercase tracking-[0.18em] text-charcoal/85">
                Continue with Google
              </span>
            </button>

            <div className="my-6 flex items-center gap-4">
              <span className="h-px flex-1 bg-cocoa/15" aria-hidden="true" />
              <span className="text-[10px] font-medium uppercase tracking-[0.24em] text-charcoal/45">
                Or continue with email
              </span>
              <span className="h-px flex-1 bg-cocoa/15" aria-hidden="true" />
            </div>

            <form onSubmit={handleSendOtp} className="space-y-4" noValidate>
            <label className="block">
              <span className="block text-[11px] font-medium uppercase tracking-[0.18em] text-charcoal/55">
                Email address
              </span>
              <div className="mt-2 flex items-center gap-3 rounded-xl border border-cocoa/20 bg-cream px-4 py-3 transition duration-500 focus-within:border-cocoa">
                <Mail
                  className="h-4 w-4 shrink-0 text-cocoa"
                  aria-hidden="true"
                />
                <input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full bg-transparent text-base text-charcoal outline-none placeholder:text-charcoal/35"
                  aria-label="Email address"
                  autoFocus
                />
              </div>
            </label>

            <SubmitButton
              disabled={!emailIsValid || pending}
              label={pending ? "Sending code…" : "Send code"}
            />

            {error ? (
              <p className="text-center text-xs text-burnt-red">
                {error}
              </p>
            ) : null}

            <p className="pt-2 text-center text-xs leading-6 text-charcoal/45">
              By continuing, you agree to our{" "}
              <Link href="/terms" className="soft-link">
                Terms
              </Link>{" "}
              and{" "}
              <Link href="/privacy-policy" className="soft-link">
                Privacy policy
              </Link>
              .
            </p>
            </form>
          </div>
        ) : (
          <form
            onSubmit={handleVerifyOtp}
            className="mt-9 w-full space-y-5"
            noValidate
          >
            {needsName ? (
              <label className="block">
                <span className="block text-[11px] font-medium uppercase tracking-[0.18em] text-charcoal/55">
                  Your name
                </span>
                <input
                  type="text"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="How should we address you?"
                  className="mt-2 block w-full rounded-xl border border-cocoa/20 bg-cream px-4 py-3 text-base text-charcoal outline-none transition duration-500 placeholder:text-charcoal/35 focus:border-cocoa"
                />
              </label>
            ) : null}

            <div>
              <span className="block text-[11px] font-medium uppercase tracking-[0.18em] text-charcoal/55">
                Verification code
              </span>
              <OtpInput
                value={otp}
                onChange={setOtp}
                onComplete={() => {
                  // Auto-submit when the user pastes/types all 6 digits, if
                  // name (when required) is already valid.
                  if (
                    !pending &&
                    (!needsName || name.trim().length >= 2)
                  ) {
                    document
                      .getElementById("otp-form-submit")
                      ?.click();
                  }
                }}
              />
            </div>

            <SubmitButton
              id="otp-form-submit"
              disabled={!otpIsValid || !nameIsValid || pending}
              label={
                pending
                  ? "verifying…"
                  : needsName
                    ? "Create account & continue"
                    : "Verify & continue"
              }
            />

            {error ? (
              <p className="text-center text-xs text-burnt-red">
                {error}
              </p>
            ) : null}

            <div className="flex items-center justify-between text-xs text-charcoal/55">
              <button
                type="button"
                onClick={changeEmail}
                className="soft-link"
              >
                Change email
              </button>
              <button
                type="button"
                onClick={handleResend}
                disabled={resendCountdown > 0 || pending}
                className="soft-link disabled:opacity-50 disabled:hover:bg-[length:0_1px]"
              >
                {resendCountdown > 0
                  ? `resend in ${resendCountdown}s`
                  : resending
                    ? "Sending…"
                    : "Resend code"}
              </button>
            </div>
          </form>
        )}

        <div className="mt-10 flex items-center gap-2 text-xs text-charcoal/45">
          <ShieldCheck className="h-3.5 w-3.5 text-cocoa" aria-hidden="true" />
          Secure sign-in · we never store your code
        </div>

      </div>
    </main>
  );
}

/** Google's official multi-colour "G" glyph. Small SVG so we don't pull an
 *  icon-brand package just for one button. */
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

function SubmitButton({
  disabled,
  label,
  id,
}: {
  disabled: boolean;
  label: string;
  id?: string;
}) {
  return (
    <button
      id={id}
      type="submit"
      disabled={disabled}
      className="group/cta flex min-h-[56px] w-full items-center justify-center rounded-2xl bg-maroon px-6 shadow-[0_18px_40px_rgba(74,31,31,0.22)] transition duration-700 hover:bg-maroon/90 hover:shadow-[0_22px_52px_rgba(74,31,31,0.3)] disabled:opacity-50 disabled:hover:bg-maroon disabled:hover:shadow-[0_18px_40px_rgba(74,31,31,0.22)]"
    >
      <span className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.24em] text-cream">
        {label}
        <ArrowRight
          className="h-4 w-4 transition-transform duration-500 group-hover/cta:translate-x-1"
          aria-hidden="true"
        />
      </span>
    </button>
  );
}

interface OtpInputProps {
  value: string[];
  onChange: (next: string[]) => void;
  onComplete?: () => void;
}
function OtpInput({ value, onChange, onComplete }: OtpInputProps) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  function setDigit(i: number, digit: string) {
    const next = [...value];
    next[i] = digit;
    onChange(next);
    if (digit && i < OTP_LENGTH - 1) {
      refs.current[i + 1]?.focus();
    }
    if (next.every((d) => d.length === 1)) {
      onComplete?.();
    }
  }

  function handleKey(e: KeyboardEvent<HTMLInputElement>, i: number) {
    if (e.key === "Backspace" && !value[i] && i > 0) {
      refs.current[i - 1]?.focus();
    } else if (e.key === "ArrowLeft" && i > 0) {
      refs.current[i - 1]?.focus();
    } else if (e.key === "ArrowRight" && i < OTP_LENGTH - 1) {
      refs.current[i + 1]?.focus();
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, OTP_LENGTH);
    if (!pasted) return;
    e.preventDefault();
    const next = Array(OTP_LENGTH).fill("");
    for (let i = 0; i < pasted.length; i++) next[i] = pasted[i];
    onChange(next);
    const focusIdx = Math.min(pasted.length, OTP_LENGTH - 1);
    refs.current[focusIdx]?.focus();
    if (pasted.length === OTP_LENGTH) onComplete?.();
  }

  return (
    <div className="mt-3 flex justify-between gap-2">
      {value.map((digit, i) => (
        <OtpBox
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          value={digit}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "").slice(-1);
            setDigit(i, v);
          }}
          onKeyDown={(e) => handleKey(e, i)}
          onPaste={i === 0 ? handlePaste : undefined}
          autoFocus={i === 0}
        />
      ))}
    </div>
  );
}

interface OtpBoxProps {
  value: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  onPaste?: (e: ClipboardEvent<HTMLInputElement>) => void;
  autoFocus?: boolean;
}
const OtpBox = forwardRef<HTMLInputElement, OtpBoxProps>(function OtpBox(
  { value, onChange, onKeyDown, onPaste, autoFocus },
  ref,
) {
  return (
    <input
      ref={ref}
      type="text"
      inputMode="numeric"
      autoComplete="one-time-code"
      maxLength={1}
      value={value}
      onChange={onChange}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
      autoFocus={autoFocus}
      className="h-13 w-11 rounded-xl border border-cocoa/22 bg-cream text-center font-display text-2xl text-maroon tabular-nums outline-none transition duration-500 focus:border-cocoa focus:ring-2 focus:ring-cocoa/15 md:h-14 md:w-12"
      aria-label="One-time code digit"
    />
  );
});
