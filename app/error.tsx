"use client";

import Link from "next/link";
import { useEffect } from "react";
import { ArrowRight, RotateCw } from "lucide-react";

// Root-level error boundary — catches anything uncaught anywhere in the app
// (storefront, admin, auth). It renders below app/layout.tsx (so <html>/<body>
// and the brand fonts are already in place) but above every nested layout, so
// it can't assume the storefront header/footer or the admin shell are
// mounted — this has to be a standalone page, same as app/not-found.tsx.
export default function GlobalErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[error boundary]", error);
  }, [error]);

  return (
    <main className="paper-grain relative flex min-h-screen items-center justify-center overflow-hidden bg-cream px-6 py-24">
      <div className="mx-auto flex max-w-xl flex-col items-center text-center">
        <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-cocoa">
          Something went wrong
        </p>

        <div
          aria-hidden="true"
          className="mt-6 flex items-center gap-3 text-cocoa/50"
        >
          <span className="h-px w-10 bg-cocoa/30" />
          <span className="font-display text-2xl leading-none">✽</span>
          <span className="h-px w-10 bg-cocoa/30" />
        </div>

        <h1 className="mt-6 font-display text-[32px] leading-[1.06] text-maroon md:text-[44px]">
          A stitch came undone.
        </h1>

        <p className="mt-4 max-w-md text-base leading-8 text-charcoal/65">
          Something unexpected happened on our end. Please try again, or head
          back home — nothing you did caused this.
        </p>

        <div className="mt-10 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-center">
          <button
            type="button"
            onClick={reset}
            className="group/cta inline-flex min-h-[52px] items-center justify-center gap-2 rounded-2xl bg-cocoa px-7 text-[11px] font-bold uppercase tracking-[0.24em] text-cream shadow-[0_14px_34px_rgba(140,106,90,0.22)] transition duration-700 hover:bg-cocoa/90"
          >
            <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
            Try again
          </button>
          <Link
            href="/"
            className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-2xl border border-cocoa/24 bg-cream px-7 text-[11px] font-bold uppercase tracking-[0.24em] text-cocoa transition duration-700 hover:border-cocoa hover:bg-cocoa/6"
          >
            Back home
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </main>
  );
}
