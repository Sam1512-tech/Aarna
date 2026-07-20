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
import { useState, useTransition } from "react";
import { signup } from "@/lib/actions/auth";
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
