"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Mail } from "lucide-react";
import { useState, useTransition } from "react";
import { requestPasswordReset } from "@/lib/actions/auth";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ForgotPasswordView() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const emailIsValid = EMAIL_REGEX.test(email);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!emailIsValid) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await requestPasswordReset(email);
        if (res.ok) {
          setSent(true);
          setMessage(res.message ?? null);
        } else {
          setError(res.message ?? "couldn't send the reset link.");
        }
      } catch {
        setError("something went wrong. please try again.");
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
          {sent ? "CHECK YOUR EMAIL" : "RESET YOUR PASSWORD"}
        </h1>
        <p className="mt-3 max-w-xs text-center text-sm leading-6 text-charcoal/60">
          {sent
            ? message ??
              "if that email is registered, we've sent a reset link. please check your inbox."
            : "enter your email and we'll send you a link to set a new password."}
        </p>

        {!sent ? (
          <form
            onSubmit={handleSubmit}
            className="mt-9 w-full space-y-4"
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

            <button
              type="submit"
              disabled={!emailIsValid || pending}
              className="group/cta flex min-h-[56px] w-full items-center justify-center rounded-2xl bg-maroon px-6 shadow-[0_18px_40px_rgba(74,31,31,0.22)] transition duration-700 hover:bg-maroon/90 hover:shadow-[0_22px_52px_rgba(74,31,31,0.3)] disabled:opacity-50 disabled:hover:bg-maroon disabled:hover:shadow-[0_18px_40px_rgba(74,31,31,0.22)]"
            >
              <span className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.24em] text-cream">
                {pending ? "sending link…" : "send reset link"}
                <ArrowRight
                  className="h-4 w-4 transition-transform duration-500 group-hover/cta:translate-x-1"
                  aria-hidden="true"
                />
              </span>
            </button>

            {error ? (
              <p className="text-center text-xs lowercase text-burnt-red">
                {error}
              </p>
            ) : null}
          </form>
        ) : (
          <div className="mt-9 w-full">
            <Link
              href="/login"
              className="flex min-h-[56px] w-full items-center justify-center rounded-2xl border border-cocoa/24 bg-cream px-6 transition duration-700 hover:bg-cocoa/8"
            >
              <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.24em] text-cocoa">
                back to sign in
              </span>
            </Link>
          </div>
        )}

        <p className="mt-6 text-center text-xs lowercase text-charcoal/50">
          remembered it?{" "}
          <Link href="/login" className="soft-link text-cocoa">
            sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
