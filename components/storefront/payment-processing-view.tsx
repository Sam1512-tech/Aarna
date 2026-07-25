"use client";

import { useRouter } from "next/navigation";
import { Lock, ShieldCheck } from "lucide-react";
import { useEffect } from "react";

interface PaymentProcessingViewProps {
  orderNumber: string;
}

// Visual bridge after Razorpay returns success. The server webhook flips the
// order from "pending" → "paid" asynchronously (a couple of seconds), so we
// hold here briefly then forward to /order-confirmation/{orderNumber}, which
// reads the authoritative status. If the user lands here on a real failure
// instead, the confirmation page handles that surface.
const REDIRECT_DELAY_MS = 3500;

export function PaymentProcessingView({
  orderNumber,
}: PaymentProcessingViewProps) {
  const router = useRouter();

  useEffect(() => {
    const t = window.setTimeout(() => {
      router.push(`/order-confirmation/${encodeURIComponent(orderNumber)}`);
    }, REDIRECT_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [orderNumber, router]);

  // Best-effort: warn the user if they try to reload mid-verification.
  useEffect(() => {
    function beforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, []);

  return (
    <section
      className="paper-grain flex min-h-screen items-center justify-center bg-cream px-5 pb-24 pt-[128px] text-center md:px-6 md:pt-36"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex max-w-xl flex-col items-center">
        <PaymentPulse />

        <p className="mt-10 text-sm font-bold uppercase tracking-[0.24em] text-cocoa">
          Please wait
        </p>
        <h1 className="mt-4 font-display text-[40px] leading-[1.05] text-maroon md:text-6xl">
          Processing your payment…
        </h1>
        <p className="mt-5 max-w-md text-base leading-7 text-charcoal/60">
          Please wait while we securely verify your payment and confirm your
          order. This usually takes only a few seconds.
        </p>

        <div className="mt-8 rounded-full border border-cocoa/18 bg-cream/70 px-5 py-2 text-[11px] uppercase tracking-[0.18em] text-cocoa">
          Order&nbsp;·&nbsp;
          <span className="text-charcoal/75">{orderNumber}</span>
        </div>

        <div className="mt-8 inline-flex items-center gap-2 text-xs text-charcoal/55">
          <ShieldCheck className="h-3.5 w-3.5 text-cocoa" aria-hidden="true" />
          Secure verification in progress · please don&rsquo;t refresh
        </div>
      </div>
    </section>
  );
}

function PaymentPulse() {
  return (
    <div className="relative flex h-28 w-28 items-center justify-center">
      <span
        aria-hidden="true"
        className="absolute inset-0 rounded-full bg-cocoa/10 animate-[ping_2.4s_cubic-bezier(0,0,0.2,1)_infinite]"
      />
      <span
        aria-hidden="true"
        className="absolute inset-3 rounded-full bg-cocoa/15 animate-[ping_2.4s_cubic-bezier(0,0,0.2,1)_infinite] [animation-delay:600ms]"
      />
      <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-maroon shadow-[0_18px_40px_rgba(74,31,31,0.22)]">
        <Lock className="h-5 w-5 text-cream" aria-hidden="true" />
      </span>
    </div>
  );
}
