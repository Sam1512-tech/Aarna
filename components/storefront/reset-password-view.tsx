"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Eye, EyeOff, Lock } from "lucide-react";
import { useState, useTransition } from "react";
import { updatePassword } from "@/lib/actions/auth";

// Match backend password policy: 8+ chars (server has the real enforcer; this
// is purely for instant feedback so the user doesn't submit a too-short pwd).
const MIN_LENGTH = 8;

export function ResetPasswordView() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  const lengthOk = password.length >= MIN_LENGTH;
  const matchOk = confirm.length > 0 && password === confirm;
  const canSubmit = lengthOk && matchOk;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await updatePassword(password);
        if (res.ok) {
          setDone(true);
          // Brief pause so the user reads the success state, then off to /account.
          window.setTimeout(() => router.push("/account"), 1400);
        } else {
          setError(res.message ?? "Couldn't update password.");
        }
      } catch {
        setError("Something went wrong. Please try again.");
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
          {done ? "PASSWORD UPDATED" : "SET A NEW PASSWORD"}
        </h1>
        <p className="mt-3 max-w-xs text-center text-sm leading-6 text-charcoal/60">
          {done
            ? "You're signed in — taking you to your account."
            : "choose a password you'll remember — at least 8 characters."}
        </p>

        {!done ? (
          <form
            onSubmit={handleSubmit}
            className="mt-9 w-full space-y-4"
            noValidate
          >
            <PasswordField
              label="New password"
              value={password}
              onChange={setPassword}
              show={show}
              onToggleShow={() => setShow((s) => !s)}
              autoComplete="new-password"
              autoFocus
            />
            <PasswordField
              label="Confirm password"
              value={confirm}
              onChange={setConfirm}
              show={show}
              onToggleShow={() => setShow((s) => !s)}
              autoComplete="new-password"
            />

            {/* Validation hints */}
            <ul className="space-y-1.5 pl-1 text-xs text-charcoal/55">
              <Hint ok={lengthOk}>At least 8 characters</Hint>
              <Hint ok={confirm.length > 0 && matchOk}>Passwords match</Hint>
            </ul>

            <button
              type="submit"
              disabled={!canSubmit || pending}
              className="group/cta mt-2 flex min-h-[56px] w-full items-center justify-center rounded-2xl bg-maroon px-6 shadow-[0_18px_40px_rgba(74,31,31,0.22)] transition duration-700 hover:bg-maroon/90 hover:shadow-[0_22px_52px_rgba(74,31,31,0.3)] disabled:opacity-50 disabled:hover:bg-maroon disabled:hover:shadow-[0_18px_40px_rgba(74,31,31,0.22)]"
            >
              <span className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.24em] text-cream">
                {pending ? "Updating…" : "Update password"}
                <ArrowRight
                  className="h-4 w-4 transition-transform duration-500 group-hover/cta:translate-x-1"
                  aria-hidden="true"
                />
              </span>
            </button>

            {error ? (
              <p className="text-center text-xs text-burnt-red">
                {error}
              </p>
            ) : null}
          </form>
        ) : (
          <div className="mt-10 flex h-14 w-14 items-center justify-center rounded-full bg-maroon shadow-[0_18px_40px_rgba(74,31,31,0.22)]">
            <Check className="h-6 w-6 text-cream" strokeWidth={2.4} aria-hidden="true" />
          </div>
        )}
      </div>
    </main>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  show,
  onToggleShow,
  autoComplete,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggleShow: () => void;
  autoComplete: string;
  autoFocus?: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] font-medium uppercase tracking-[0.18em] text-charcoal/55">
        {label}
      </span>
      <div className="mt-2 flex items-center gap-3 rounded-xl border border-cocoa/20 bg-cream px-4 py-3 transition duration-500 focus-within:border-cocoa">
        <Lock className="h-4 w-4 shrink-0 text-cocoa" aria-hidden="true" />
        <input
          type={show ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="••••••••"
          className="w-full bg-transparent text-base text-charcoal outline-none placeholder:text-charcoal/35"
          aria-label={label}
          autoFocus={autoFocus}
        />
        <button
          type="button"
          onClick={onToggleShow}
          aria-label={show ? "Hide password" : "Show password"}
          aria-pressed={show}
          className="inline-flex h-7 w-7 items-center justify-center rounded-full text-cocoa/60 transition duration-500 hover:bg-cocoa/10 hover:text-cocoa"
        >
          {show ? (
            <EyeOff className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Eye className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      </div>
    </label>
  );
}

function Hint({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li
      className={`flex items-center gap-2 transition duration-300 ${ok ? "text-cocoa" : ""}`}
    >
      <span
        aria-hidden="true"
        className={`inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border ${
          ok ? "border-cocoa bg-cocoa text-cream" : "border-charcoal/25"
        }`}
      >
        {ok ? <Check className="h-2.5 w-2.5" strokeWidth={3} /> : null}
      </span>
      {children}
    </li>
  );
}
