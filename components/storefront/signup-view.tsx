"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Eye,
  EyeOff,
  Lock,
  Mail,
  ShieldCheck,
  User,
} from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { resendSignupConfirmation, signup } from "@/lib/actions/auth";
import { GoogleSignInButton } from "@/components/storefront/google-signin-button";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

interface SignupViewProps {
  /** Where to land after successful sign-up. */
  nextPath: string;
}

export function SignupView({ nextPath }: SignupViewProps) {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [confirmationMessage, setConfirmationMessage] = useState<string | null>(null);
  // Post-signup resend affordance — the first email can land in spam or
  // expire, and without this the "check your inbox" panel was a dead end.
  // The countdown is a client courtesy; the server action has the real
  // rate limit.
  const [resendCountdown, setResendCountdown] = useState(0);
  const [resendNotice, setResendNotice] = useState<string | null>(null);

  useEffect(() => {
    if (resendCountdown <= 0) return;
    const t = window.setTimeout(() => setResendCountdown((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [resendCountdown]);

  const nameIsValid = fullName.trim().length >= 2;
  const emailIsValid = EMAIL_REGEX.test(email);
  const passwordIsValid = password.length >= MIN_PASSWORD;
  const canSubmit = nameIsValid && emailIsValid && passwordIsValid && !pending;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await signup({
          email,
          password,
          fullName: fullName.trim(),
        });
        if (!result.ok) {
          setError(result.message ?? "Couldn't create account. Please try again.");
          return;
        }
        if (result.requiresEmailConfirmation) {
          // No session yet — navigating to nextPath (a protected page) would
          // just bounce back to /login with no explanation. Show the
          // "check your inbox" message in place instead.
          setConfirmationMessage(
            result.message ?? "Check your inbox — we've sent you a verification email.",
          );
          setResendCountdown(30);
          return;
        }
        router.push(nextPath);
      } catch {
        setError("Couldn't create account. Please try again.");
      }
    });
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

        <h1 className="mt-8 font-display text-[38px] uppercase leading-[1.06] tracking-[0.02em] text-maroon md:text-5xl">
          CREATE ACCOUNT
        </h1>
        <p className="mt-3 max-w-xs text-center text-sm leading-6 text-charcoal/60">
          Welcome to aarna — a few details to get you started.
        </p>

        <div className="mt-10 w-full space-y-6">
          {confirmationMessage ? (
            <div className="rounded-2xl border border-cocoa/20 bg-cocoa/5 px-6 py-8 text-center">
              <ShieldCheck className="mx-auto h-6 w-6 text-cocoa" aria-hidden="true" />
              <p className="mt-4 text-sm leading-6 text-charcoal/80">
                {confirmationMessage}
              </p>
              <p className="mt-2 text-xs text-charcoal/50">
                The link signs you in automatically — no need to come back here.
              </p>

              {resendNotice && resendCountdown > 0 ? (
                <p className="mt-5 text-xs text-cocoa">{resendNotice}</p>
              ) : (
                <p className="mt-5 text-xs text-charcoal/50">
                  Didn&apos;t get it? Check spam, or{" "}
                  <button
                    type="button"
                    disabled={resendCountdown > 0 || pending}
                    onClick={() => {
                      startTransition(async () => {
                        try {
                          const res = await resendSignupConfirmation(email);
                          if (res.ok) {
                            setError(null);
                            setResendNotice(
                              res.message ?? "We've sent a fresh link.",
                            );
                            setResendCountdown(30);
                          } else {
                            setError(res.message ?? "Couldn't resend.");
                          }
                        } catch {
                          setError("Couldn't resend. Please try again.");
                        }
                      });
                    }}
                    className="soft-link text-cocoa disabled:opacity-50"
                  >
                    {resendCountdown > 0
                      ? `resend in ${resendCountdown}s`
                      : "resend the email"}
                  </button>
                </p>
              )}

              <p className="mt-4 text-xs text-charcoal/50">
                Already had an account with this email?{" "}
                {/* text-cocoa goes on the inner span, not the Link itself —
                    the unlayered `a { color: inherit }` in globals.css beats
                    Tailwind's text-* utilities applied directly to an anchor
                    (same reasoning as the mobile nav drawer's comment above). */}
                <Link href="/login" className="soft-link font-semibold">
                  <span className="text-cocoa">Sign in</span>
                </Link>{" "}
                or{" "}
                <Link href="/forgot-password" className="soft-link text-cocoa">
                  reset your password
                </Link>
                .
              </p>

              {error ? (
                <p className="mt-4 text-xs text-burnt-red">{error}</p>
              ) : null}
            </div>
          ) : (
            <>
              <GoogleSignInButton
                nextPath={nextPath}
                label="Sign up with google"
                disabled={pending}
                onError={setError}
              />

              <Divider label="Or sign up with email" />

              <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                <Field
                  label="Full name"
                  Icon={User}
                  inputProps={{
                    type: "text",
                    autoComplete: "name",
                    value: fullName,
                    onChange: (e) => setFullName(e.target.value),
                    placeholder: "How should we address you?",
                    autoFocus: true,
                    "aria-label": "Full name",
                  }}
                />
                <Field
                  label="Email address"
                  Icon={Mail}
                  inputProps={{
                    type: "email",
                    inputMode: "email",
                    autoComplete: "email",
                    value: email,
                    onChange: (e) => setEmail(e.target.value),
                    placeholder: "you@example.com",
                    "aria-label": "Email address",
                  }}
                />
                <div>
                  <Field
                    label="Password"
                    Icon={Lock}
                    inputProps={{
                      type: showPassword ? "text" : "password",
                      autoComplete: "new-password",
                      value: password,
                      onChange: (e) => setPassword(e.target.value),
                      placeholder: "••••••••",
                      "aria-label": "Password",
                    }}
                    rightSlot={
                      <button
                        type="button"
                        onClick={() => setShowPassword((s) => !s)}
                        aria-label={
                          showPassword ? "Hide password" : "Show password"
                        }
                        aria-pressed={showPassword}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-full text-cocoa/60 transition duration-500 hover:bg-cocoa/10 hover:text-cocoa"
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" aria-hidden="true" />
                        ) : (
                          <Eye className="h-4 w-4" aria-hidden="true" />
                        )}
                      </button>
                    }
                  />
                  <p className="mt-1.5 pl-1 text-xs text-charcoal/50">
                    at least {MIN_PASSWORD} characters
                  </p>
                </div>

                <SubmitButton
                  disabled={!canSubmit}
                  label={pending ? "Creating account…" : "Create account"}
                />

                {error ? (
                  <p className="text-center text-xs text-burnt-red">
                    {error}
                  </p>
                ) : null}
              </form>
            </>
          )}
        </div>

        <div className="mt-10 flex items-center gap-2 text-xs text-charcoal/45">
          <ShieldCheck className="h-3.5 w-3.5 text-cocoa" aria-hidden="true" />
          Secure sign-up · we never share your details
        </div>

        <p className="mt-6 text-center text-xs text-charcoal/50">
          already have an account?{" "}
          <Link
            href={`/login?next=${encodeURIComponent(nextPath)}`}
            className="soft-link text-cocoa"
          >
            Sign in
          </Link>
        </p>

        <p className="mt-6 text-center text-xs leading-6 text-charcoal/40">
          by creating an account, you agree to our{" "}
          <Link href="/terms" className="soft-link">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy-policy" className="soft-link">
            Privacy policy
          </Link>
          .
        </p>
      </div>
    </main>
  );
}

function Divider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-4">
      <span className="h-px flex-1 bg-cocoa/15" aria-hidden="true" />
      <span className="text-[10px] font-medium uppercase tracking-[0.24em] text-charcoal/45">
        {label}
      </span>
      <span className="h-px flex-1 bg-cocoa/15" aria-hidden="true" />
    </div>
  );
}

function Field({
  label,
  Icon,
  inputProps,
  rightSlot,
}: {
  label: string;
  Icon: typeof Mail;
  inputProps: React.InputHTMLAttributes<HTMLInputElement>;
  rightSlot?: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] font-medium uppercase tracking-[0.18em] text-charcoal/55">
        {label}
      </span>
      <div className="mt-2 flex items-center gap-3 rounded-xl border border-cocoa/20 bg-cream px-4 py-3 transition duration-500 focus-within:border-cocoa">
        <Icon className="h-4 w-4 shrink-0 text-cocoa" aria-hidden="true" />
        <input
          {...inputProps}
          className="w-full bg-transparent text-base text-charcoal outline-none placeholder:text-charcoal/35"
        />
        {rightSlot}
      </div>
    </label>
  );
}

function SubmitButton({
  disabled,
  label,
}: {
  disabled: boolean;
  label: string;
}) {
  return (
    <button
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
