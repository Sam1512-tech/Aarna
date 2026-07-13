import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Search } from "lucide-react";

export const metadata: Metadata = {
  title: "page not found",
};

export default function NotFound() {
  return (
    <main className="paper-grain relative flex min-h-screen items-center justify-center overflow-hidden bg-cream px-6 py-24">
      <div className="mx-auto flex max-w-xl flex-col items-center text-center">
        <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-cocoa">
          four · oh · four
        </p>

        <h1 className="mt-6 font-display text-[112px] leading-[0.9] tracking-tight text-maroon md:text-[168px]">
          404
        </h1>

        <div
          aria-hidden="true"
          className="mt-6 flex items-center gap-3 text-cocoa/50"
        >
          <span className="h-px w-10 bg-cocoa/30" />
          <span className="font-display text-2xl leading-none">✽</span>
          <span className="h-px w-10 bg-cocoa/30" />
        </div>

        <h2 className="mt-6 font-display text-[32px] lowercase leading-[1.06] text-maroon md:text-[44px]">
          this thread has come loose.
        </h2>

        <p className="mt-4 max-w-md text-base leading-8 text-charcoal/65">
          The page you&rsquo;re looking for has wandered off, or perhaps it
          never existed. Let&rsquo;s find you something to hold onto.
        </p>

        <div className="mt-10 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-center">
          <Link
            href="/shop"
            className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-2xl bg-cocoa px-7 text-[11px] font-bold uppercase tracking-[0.24em] text-cream shadow-[0_14px_34px_rgba(140,106,90,0.22)] transition duration-700 hover:bg-cocoa/90"
          >
            enter the wardrobe
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
          <Link
            href="/search"
            className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-2xl border border-cocoa/24 bg-cream px-7 text-[11px] font-bold uppercase tracking-[0.24em] text-cocoa transition duration-700 hover:border-cocoa hover:bg-cocoa/6"
          >
            <Search className="h-3.5 w-3.5" aria-hidden="true" />
            search
          </Link>
        </div>

        <p className="mt-12 text-xs lowercase leading-6 text-charcoal/50">
          or head back{" "}
          <Link href="/" className="soft-link text-cocoa">
            home
          </Link>{" "}
          · questions? visit our{" "}
          <Link href="/faq" className="soft-link text-cocoa">
            faq
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
