"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updateProfile } from "@/lib/actions/account";
import { actionErrorMessage } from "@/lib/action-error";

interface AccountProfileViewProps {
  fullName: string;
  phone: string;
  whatsappOptIn: boolean;
}

export function AccountProfileView({
  fullName: initialFullName,
  phone: initialPhone,
  whatsappOptIn: initialWhatsappOptIn,
}: AccountProfileViewProps) {
  const router = useRouter();
  const [fullName, setFullName] = useState(initialFullName);
  const [phone, setPhone] = useState(initialPhone);
  const [whatsappOptIn, setWhatsappOptIn] = useState(initialWhatsappOptIn);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const trimmedName = fullName.trim();
  const canSave = trimmedName.length >= 3 && !pending;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setError(null);
    setSaved(false);
    startTransition(async () => {
      try {
        await updateProfile({
          fullName: trimmedName,
          phone: phone.trim() || undefined,
          whatsappOptIn,
        });
        setSaved(true);
        // The "Welcome back, {name}" header lives in the server-rendered
        // account layout — refresh so it picks up the name we just saved.
        router.refresh();
      } catch (err) {
        setError(actionErrorMessage(err, "Couldn't save your profile"));
      }
    });
  }

  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-charcoal/55">
        your profile
      </p>

      <form onSubmit={handleSubmit} className="mt-6 max-w-md space-y-5">
        <label className="block">
          <span className="block text-[11px] font-medium uppercase tracking-[0.18em] text-charcoal/55">
            Full name
          </span>
          <input
            type="text"
            value={fullName}
            onChange={(e) => {
              setFullName(e.target.value);
              setSaved(false);
            }}
            className="mt-1.5 block w-full rounded-xl border border-cocoa/20 bg-cream px-4 py-2.5 text-base text-charcoal outline-none transition duration-500 focus:border-cocoa"
          />
          {trimmedName.length > 0 && trimmedName.length < 3 ? (
            <p className="mt-1.5 text-xs text-burnt-red">
              Please enter your full name
            </p>
          ) : null}
        </label>

        <label className="block">
          <span className="block text-[11px] font-medium uppercase tracking-[0.18em] text-charcoal/55">
            Phone number
          </span>
          <input
            type="tel"
            inputMode="numeric"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              setSaved(false);
            }}
            className="mt-1.5 block w-full rounded-xl border border-cocoa/20 bg-cream px-4 py-2.5 text-base text-charcoal outline-none transition duration-500 focus:border-cocoa"
          />
        </label>

        <label className="flex cursor-pointer items-start gap-3 pt-1">
          <input
            type="checkbox"
            checked={whatsappOptIn}
            onChange={(e) => {
              setWhatsappOptIn(e.target.checked);
              setSaved(false);
            }}
            className="mt-1 h-4 w-4 cursor-pointer accent-cocoa"
          />
          <span className="text-sm leading-6 text-charcoal/72">
            Send order updates over WhatsApp
          </span>
        </label>

        {error ? (
          <p role="alert" className="text-xs text-burnt-red">
            {error}
          </p>
        ) : null}

        <p aria-live="polite" className="sr-only">
          {saved ? "Profile saved" : ""}
        </p>

        <button
          type="submit"
          disabled={!canSave}
          className="inline-flex items-center gap-2 rounded-full bg-cocoa px-5 py-2.5 text-[11px] font-medium uppercase tracking-[0.18em] text-cream transition duration-500 hover:bg-cocoa/90 disabled:opacity-50"
        >
          {pending ? (
            "Saving…"
          ) : saved ? (
            <>
              Saved
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
            </>
          ) : (
            "Save changes"
          )}
        </button>
      </form>
    </div>
  );
}
