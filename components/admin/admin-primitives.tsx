import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";

/**
 * Shared header used at the top of every admin section:
 * eyebrow ("catalog · products"), title, optional intro, and an optional
 * primary action button (typically "add new").
 */
export function AdminPageHeader({
  eyebrow,
  title,
  intro,
  action,
}: {
  eyebrow?: string;
  title: string;
  intro?: string;
  action?: { href: string; label: string };
}) {
  return (
    <header className="flex flex-col gap-4 border-b border-cocoa/12 pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow ? (
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-charcoal/55">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="mt-2 font-display text-3xl lowercase leading-tight text-maroon md:text-4xl">
          {title}
        </h1>
        {intro ? (
          <p className="mt-2 max-w-xl text-sm leading-6 text-charcoal/60">
            {intro}
          </p>
        ) : null}
      </div>
      {action ? (
        <Link
          href={action.href}
          className="inline-flex items-center gap-2 self-start rounded-full bg-cocoa px-4 py-2 text-[11px] font-medium uppercase tracking-[0.18em] text-cream shadow-[0_10px_28px_rgba(140,106,90,0.22)] transition duration-500 hover:bg-cocoa/90 sm:self-end"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          {action.label}
        </Link>
      ) : null}
    </header>
  );
}

/**
 * Card container for admin lists. Wraps content in the brand's soft cream
 * card style with consistent padding + shadow.
 */
export function AdminCard({
  children,
  padded = true,
}: {
  children: React.ReactNode;
  padded?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border border-cocoa/12 bg-cream shadow-[0_10px_28px_rgba(43,38,35,0.04)] ${
        padded ? "p-5 md:p-6" : ""
      }`}
    >
      {children}
    </div>
  );
}

/**
 * Small subdued pill used for status badges (payment, fulfillment, review
 * status, coupon active/inactive, etc.). Tone maps to brand-consistent colours.
 */
export function StatusPill({
  label,
  tone = "muted",
}: {
  label: string;
  tone?: "ok" | "warn" | "bad" | "muted";
}) {
  const cls =
    tone === "ok"
      ? "border-cocoa/25 bg-cocoa/8 text-cocoa"
      : tone === "warn"
        ? "border-burnt-red/25 bg-burnt-red/8 text-burnt-red"
        : tone === "bad"
          ? "border-burnt-red/30 bg-burnt-red/10 text-burnt-red"
          : "border-cocoa/15 bg-cream text-charcoal/60";
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.16em] ${cls}`}
    >
      {label}
    </span>
  );
}

/**
 * Renders an empty state inside an AdminCard — used when a list has no rows.
 */
export function AdminEmpty({
  title,
  description,
  cta,
}: {
  title: string;
  description: string;
  cta?: { href: string; label: string };
}) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-cocoa/12 bg-cream/70 py-14 text-center">
      <h2 className="font-display text-2xl lowercase text-maroon">{title}</h2>
      <p className="mt-2 max-w-md px-6 text-sm text-charcoal/60">
        {description}
      </p>
      {cta ? (
        <Link
          href={cta.href}
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-cocoa px-4 py-2 text-[11px] font-medium uppercase tracking-[0.18em] text-cream transition duration-500 hover:bg-cocoa/90"
        >
          {cta.label}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      ) : null}
    </div>
  );
}

/**
 * Uniform admin table row helper — not a full data-table library, just tokens
 * so every list looks the same. Use with a plain <table> in the page.
 */
export function tableClasses() {
  return {
    wrapper:
      "overflow-hidden rounded-2xl border border-cocoa/12 bg-cream shadow-[0_10px_28px_rgba(43,38,35,0.04)]",
    table: "w-full text-left text-sm",
    thead: "bg-cocoa/5 text-[10px] font-medium uppercase tracking-[0.16em] text-charcoal/60",
    th: "px-4 py-3",
    tr: "border-t border-cocoa/8",
    td: "px-4 py-3.5 align-middle text-charcoal/80",
  } as const;
}
