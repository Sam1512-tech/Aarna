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
} from "lucide-react";
import { useState, useTransition } from "react";
import { login, sendEmailOtp } from "@/lib/actions/auth";
import { GoogleSignInButton } from "@/components/storefront/google-signin-button";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

interface LoginViewProps {
  /** Where to land after successful sign-in. */
  nextPath: string;
}

type Mode = "password" | "otp";

export function LoginView({ nextPath }: LoginViewProps) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const emailIsValid = EMAIL_REGEX.test(email);
  const passwordIsValid = password.length >= MIN_PASSWORD;
  const canSubmitPassword = emailIsValid && passwordIsValid && !pending;
  const canSubmitOtp = emailIsValid && !pending;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (mode === "password") {
      if (!canSubmitPassword) return;
      startTransition(async () => {
        try {
          const result = await login({ email, password });
          if (!result.ok) {
            setError(result.message ?? "couldn't sign in. please try again.");
            return;
          }
          router.push(nextPath);
        } catch {
          setError("couldn't sign in. please try again.");
        }
      });
      return;
    }

    // OTP mode — send the code and hand off to /login/otp.
    if (!canSubmitOtp) return;
    startTransition(async () => {
      try {
        const result = await sendEmailOtp(email);
        if (!result.ok) {
          setError(result.message ?? "couldn't send code. please try again.");
          return;
        }
        // Take them to the OTP verification page prefilled with the email.
        router.push(
          `/login/otp?next=${encodeURIComponent(nextPath)}&email=${encodeURIComponent(email)}`,
        );
      } catch {
        setError("couldn't send code. please try again.");
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
          SIGN IN
        </h1>
        <p className="mt-3 max-w-xs text-center text-sm leading-6 text-charcoal/60">
          welcome back — sign in the way that suits you.
        </p>

        <div className="fade-rise mt-10 w-full space-y-6">
          <GoogleSignInButton nextPath={nextPath} onError={setError} />

          <Divider label="or continue with email" />

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
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

            {mode === "password" ? (
              <>
                <label className="block">
                  <span className="block text-[11px] font-medium uppercase tracking-[0.18em] text-charcoal/55">
                    password
                  </span>
                  <div className="mt-2 flex items-center gap-3 rounded-xl border border-cocoa/20 bg-cream px-4 py-3 transition duration-500 focus-within:border-cocoa">
                    <Lock
                      className="h-4 w-4 shrink-0 text-cocoa"
                      aria-hidden="true"
                    />
                    <input
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-transparent text-base text-charcoal outline-none placeholder:text-charcoal/35"
                      aria-label="Password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      aria-label={
                        showPassword ? "Hide password" : "Show password"
                      }
                      aria-pressed={showPassword}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full text-cocoa/60 transition duration-500 hover:bg-cocoa/10 hover:text-cocoa"
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <Eye className="h-4 w-4" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                </label>

                <div className="flex justify-end">
                  <Link
                    href="/forgot-password"
                    className="soft-link text-xs lowercase text-cocoa"
                  >
                    forgot password?
                  </Link>
                </div>
              </>
            ) : null}

            <SubmitButton
              disabled={
                mode === "password" ? !canSubmitPassword : !canSubmitOtp
              }
              label={
                pending
                  ? mode === "password"
                    ? "signing in…"
                    : "sending code…"
                  : mode === "password"
                    ? "sign in"
                    : "send one-time code"
              }
            />

            {error ? (
              <p className="text-center text-xs lowercase text-burnt-red">
                {error}
              </p>
            ) : null}
          </form>

          <div className="text-center">
            <button
              type="button"
              onClick={() => {
                setMode(mode === "password" ? "otp" : "password");
                setError(null);
              }}
              className="soft-link text-xs lowercase text-charcoal/55 hover:text-cocoa"
            >
              {mode === "password"
                ? "prefer a one-time code? sign in without a password"
                : "prefer a password? sign in the classic way"}
            </button>
          </div>
        </div>

        <div className="mt-10 flex items-center gap-2 text-xs lowercase text-charcoal/45">
          <ShieldCheck className="h-3.5 w-3.5 text-cocoa" aria-hidden="true" />
          secure sign-in · we never store your password in plain text
        </div>

        <p className="mt-6 text-center text-xs lowercase text-charcoal/50">
          new to aarna?{" "}
          <Link
            href={`/signup?next=${encodeURIComponent(nextPath)}`}
            className="soft-link text-cocoa"
          >
            create an account
          </Link>
        </p>

        <p className="mt-6 text-center text-xs lowercase leading-6 text-charcoal/40">
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
