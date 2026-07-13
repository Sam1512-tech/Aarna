import Link from "next/link";
import { ChevronRight } from "lucide-react";

interface LegalPageProps {
  eyebrow: string;
  title: string;
  intro?: string;
  lastUpdated?: string;
  children: React.ReactNode;
}

/**
 * Shared shell for policy / info pages. Cream background, paper-grain texture,
 * centred narrow column, breadcrumb, serif Cormorant heading, generous line
 * height on body copy. Body content is passed as children so each page can
 * compose its own sections with <LegalSection> / <LegalList>.
 */
export function LegalPage({
  eyebrow,
  title,
  intro,
  lastUpdated,
  children,
}: LegalPageProps) {
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
          <span className="text-charcoal/75">{title}</span>
        </nav>

        <header className="mt-8 border-b border-cocoa/12 pb-10">
          <p className="text-sm font-bold uppercase tracking-[0.24em] text-cocoa">
            {eyebrow}
          </p>
          <h1 className="mt-4 font-display text-[40px] leading-[1.04] text-maroon md:text-6xl">
            {title}
          </h1>
          {intro ? (
            <p className="mt-5 max-w-xl text-base leading-8 text-charcoal/65">
              {intro}
            </p>
          ) : null}
          {lastUpdated ? (
            <p className="mt-4 text-[11px] uppercase tracking-[0.18em] text-charcoal/45">
              last updated · {lastUpdated}
            </p>
          ) : null}
        </header>

        <div className="mt-10 space-y-10 pb-16">{children}</div>
      </div>
    </section>
  );
}

/**
 * A single content section with an optional heading. Use to group related
 * policy points; visual separation is a border-top and generous top padding.
 */
export function LegalSection({
  heading,
  children,
}: {
  heading?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      {heading ? (
        <h2 className="font-display text-2xl leading-tight text-maroon md:text-3xl">
          {heading}
        </h2>
      ) : null}
      <div className={heading ? "mt-5" : ""}>{children}</div>
    </section>
  );
}

/**
 * Bulleted list used across every policy page. Renders each item with the
 * brand's soft cocoa bullet marker, comfy line-height, and consistent spacing.
 */
export function LegalList({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="space-y-3.5">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3.5">
          <span
            aria-hidden="true"
            className="mt-2.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-cocoa/70"
          />
          <p className="text-base leading-7 text-charcoal/75">{item}</p>
        </li>
      ))}
    </ul>
  );
}
