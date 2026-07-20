import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Mail, Phone } from "lucide-react";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Reach the Aarna team — email us or call for questions about orders, sizing, or anything else.",
};

const EMAIL = "hello@shopaarna.in";
const PHONE_DISPLAY = "+91 79-75639485";
const PHONE_TEL = "+917975639485";

export default function ContactPage() {
  return (
    <section className="paper-grain min-h-screen bg-cream px-5 pb-24 pt-[128px] md:px-6 md:pt-36">
      <div className="mx-auto max-w-3xl">
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-1 text-[11px] uppercase tracking-[0.18em] text-charcoal/55"
        >
          <Link href="/" className="soft-link hover:text-cocoa">
            Home
          </Link>
          <ChevronRight className="h-3 w-3 opacity-60" aria-hidden="true" />
          <span className="text-charcoal/75">Contact</span>
        </nav>

        <header className="mt-8 border-b border-cocoa/12 pb-10">
          <p className="text-sm font-bold uppercase tracking-[0.24em] text-cocoa">
            Get in touch
          </p>
          <h1 className="mt-4 font-display text-[40px] leading-[1.04] text-maroon md:text-6xl">
            We&rsquo;re here to help.
          </h1>
          <p className="mt-5 max-w-xl text-base leading-8 text-charcoal/65">
            Questions about an order, sizing, fabric care, or anything else? Our
            small team reads every message — we&rsquo;ll get back to you within
            one working day.
          </p>
        </header>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          <a
            href={`mailto:${EMAIL}`}
            className="group/tile flex items-start gap-4 rounded-2xl border border-cocoa/12 bg-cream p-6 shadow-[0_10px_28px_rgba(43,38,35,0.04)] transition duration-500 hover:-translate-y-0.5 hover:border-cocoa/25 hover:shadow-[0_18px_40px_rgba(43,38,35,0.08)]"
          >
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-cocoa/10 text-cocoa">
              <Mail className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-charcoal/55">
                Email
              </p>
              <p className="mt-1 break-all text-base text-charcoal/85 group-hover/tile:text-cocoa">
                {EMAIL}
              </p>
            </div>
          </a>

          <a
            href={`tel:${PHONE_TEL}`}
            className="group/tile flex items-start gap-4 rounded-2xl border border-cocoa/12 bg-cream p-6 shadow-[0_10px_28px_rgba(43,38,35,0.04)] transition duration-500 hover:-translate-y-0.5 hover:border-cocoa/25 hover:shadow-[0_18px_40px_rgba(43,38,35,0.08)]"
          >
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-cocoa/10 text-cocoa">
              <Phone className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-charcoal/55">
                Phone
              </p>
              <p className="mt-1 text-base text-charcoal/85 group-hover/tile:text-cocoa">
                {PHONE_DISPLAY}
              </p>
            </div>
          </a>
        </div>

        <p className="mt-12 text-center text-xs leading-6 text-charcoal/50">
          For order-specific questions, sharing your order number helps us
          respond faster.
        </p>
      </div>
    </section>
  );
}
