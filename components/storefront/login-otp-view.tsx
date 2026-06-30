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

// ── UI shell only. Wire to real backend when email-OTP lands ─────────────────
//
// Aarna's current auth uses Supabase email/password. Supabase Auth also
// supports email OTP natively (no SMS provider needed), so this is a small
// backend addition for Sam:
//   1. Add server actions e.g. sendEmailOtp(email) and verifyEmailOtp(email,
//      code, name?) that wrap supabase.auth.signInWithOtp / verifyOtp.
//   2. Configure the Supabase email template (Resend hook already exists).
//
// This view simulates the flow client-side so the UX can be reviewed today.
// When the backend lands, swap the two TODO blocks to call the real actions.

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_LENGTH = 6;
const SIMULATE_DELAY_MS = 700;

type Step = "email" | "otp";

interface LoginOtpViewProps {
  nextPath: string;
}

export function LoginOtpView({ nextPath }: LoginOtpViewProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(""));
  const [name, setName] = useState("");
  const [needsName, setNeedsName] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(0);

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
      // TODO(backend): replace with `await sendEmailOtp(email)` — wraps
      // supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })
      await new Promise((r) => setTimeout(r, SIMULATE_DELAY_MS));
      // Treat emails starting with "new" as new users for the demo, so both
      // flows are visible until backend account-lookup lands.
      const isNew = email.toLowerCase().startsWith("new");
      setNeedsName(isNew);
      setStep("otp");
      setResendCountdown(30);
    } catch {
      setError("couldn't send code. please try again.");
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
      // TODO(backend): replace with
      //   await verifyEmailOtp(email, otpJoined, needsName ? name.trim() : undefined)
      // which wraps supabase.auth.verifyOtp + customers row upsert.
      await new Promise((r) => setTimeout(r, SIMULATE_DELAY_MS));
      // Preserve cart and continue directly to checkout (or wherever ?next=).
      router.push(nextPath);
    } catch {
      setError("that code didn't work. please try again.");
      setPending(false);
    }
  }

  async function handleResend() {
    if (resendCountdown > 0 || pending) return;
    setPending(true);
    setError(null);
    try {
      // TODO(backend): replace with `await sendEmailOtp(email)`.
      await new Promise((r) => setTimeout(r, SIMULATE_DELAY_MS));
      setResendCountdown(30);
    } finally {
      setPending(false);
    }
  }

  function changeEmail() {
    setStep("email");
    setOtp(Array(OTP_LENGTH).fill(""));
    setError(null);
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

        <h1 className="mt-7 font-display text-[40px] lowercase leading-[1.06] text-maroon md:text-5xl">
          {step === "email" ? "sign in" : "check your email"}
        </h1>
        <p className="mt-3 max-w-xs text-center text-sm leading-6 text-charcoal/60">
          {step === "email"
            ? "enter your email — we'll send a one-time code to verify it."
            : `we sent a 6-digit code to ${email}.`}
        </p>

        {step === "email" ? (
          <form
            onSubmit={handleSendOtp}
            className="fade-rise mt-9 w-full space-y-4"
            noValidate
          >
            <label className="block">
              <span className="block text-[11px] font-medium uppercase tracking-[0.18em] text-charcoal/55">
                email address
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
              label={pending ? "sending code…" : "send code"}
            />

            {error ? (
              <p className="text-center text-xs lowercase text-burnt-red">
                {error}
              </p>
            ) : null}

            <p className="pt-2 text-center text-xs lowercase leading-6 text-charcoal/45">
              by continuing, you agree to our{" "}
              <Link href="/terms" className="soft-link">
                terms
              </Link>{" "}
              and{" "}
              <Link href="/privacy-policy" className="soft-link">
                privacy policy
              </Link>
              .
            </p>
          </form>
        ) : (
          <form
            onSubmit={handleVerifyOtp}
            className="fade-rise mt-9 w-full space-y-5"
            noValidate
          >
            {needsName ? (
              <label className="block">
                <span className="block text-[11px] font-medium uppercase tracking-[0.18em] text-charcoal/55">
                  your name
                </span>
                <input
                  type="text"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="how should we address you?"
                  className="mt-2 block w-full rounded-xl border border-cocoa/20 bg-cream px-4 py-3 text-base text-charcoal outline-none transition duration-500 placeholder:text-charcoal/35 focus:border-cocoa"
                />
              </label>
            ) : null}

            <div>
              <span className="block text-[11px] font-medium uppercase tracking-[0.18em] text-charcoal/55">
                verification code
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
                    ? "create account & continue"
                    : "verify & continue"
              }
            />

            {error ? (
              <p className="text-center text-xs lowercase text-burnt-red">
                {error}
              </p>
            ) : null}

            <div className="flex items-center justify-between text-xs lowercase text-charcoal/55">
              <button
                type="button"
                onClick={changeEmail}
                className="soft-link"
              >
                change email
              </button>
              <button
                type="button"
                onClick={handleResend}
                disabled={resendCountdown > 0 || pending}
                className="soft-link disabled:opacity-50 disabled:hover:bg-[length:0_1px]"
              >
                {resendCountdown > 0
                  ? `resend in ${resendCountdown}s`
                  : "resend code"}
              </button>
            </div>
          </form>
        )}

        <div className="mt-10 flex items-center gap-2 text-xs lowercase text-charcoal/45">
          <ShieldCheck className="h-3.5 w-3.5 text-cocoa" aria-hidden="true" />
          secure sign-in · we never store your code
        </div>

        <p className="mt-6 text-center text-xs lowercase text-charcoal/50">
          prefer a password?{" "}
          <Link href="/login" className="soft-link text-cocoa">
            sign in with password
          </Link>
        </p>
      </div>
    </main>
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
