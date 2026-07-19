"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

/**
 * Shared admin form primitives — used by the /new and /[id]/edit pages
 * across products, coupons, banners, and collections. Deliberately plain
 * HTML (no shadcn yet) so styling stays consistent with the list pages.
 */

export function FormShell({
  onSubmit,
  children,
}: {
  onSubmit: (e: React.FormEvent) => void;
  children: React.ReactNode;
}) {
  return (
    <form
      onSubmit={onSubmit}
      className="mt-6 flex flex-col gap-6"
      noValidate
    >
      {children}
    </form>
  );
}

export function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-cocoa/12 bg-cream p-5 shadow-[0_10px_28px_rgba(43,38,35,0.04)] md:p-6">
      <header className="mb-5">
        <h2 className="font-display text-xl uppercase text-maroon">
          {title}
        </h2>
        {description ? (
          <p className="mt-1 text-sm text-charcoal/60">{description}</p>
        ) : null}
      </header>
      <div className="grid gap-4 md:grid-cols-2">{children}</div>
    </section>
  );
}

export function Field({
  label,
  hint,
  error,
  wide,
  required,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  wide?: boolean;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={wide ? "md:col-span-2" : undefined}>
      <span className="block text-[11px] font-medium uppercase tracking-[0.16em] text-charcoal/55">
        {label}
        {required ? <span className="ml-1 text-burnt-red">*</span> : null}
      </span>
      <div className="mt-1.5">{children}</div>
      {hint && !error ? (
        <p className="mt-1 text-xs text-charcoal/50">{hint}</p>
      ) : null}
      {error ? (
        <p className="mt-1 text-xs text-burnt-red">{error}</p>
      ) : null}
    </label>
  );
}

// text-base (not text-sm) below sm: — iOS Safari auto-zooms the whole page
// when a focused input/select/textarea computes to under 16px font-size.
const inputClass =
  "block w-full rounded-xl border border-cocoa/20 bg-cream px-4 py-2.5 text-base text-charcoal outline-none transition duration-500 focus:border-cocoa disabled:opacity-60 sm:text-sm";

export function TextInput(
  props: React.InputHTMLAttributes<HTMLInputElement>,
) {
  return <input {...props} className={`${inputClass} ${props.className ?? ""}`} />;
}

export function Textarea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement>,
) {
  return (
    <textarea
      {...props}
      className={`${inputClass} min-h-[104px] resize-y ${props.className ?? ""}`}
    />
  );
}

export function Select(
  props: React.SelectHTMLAttributes<HTMLSelectElement>,
) {
  return <select {...props} className={`${inputClass} ${props.className ?? ""}`} />;
}

export function CheckboxRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="md:col-span-2 inline-flex cursor-pointer items-center gap-3 rounded-xl border border-cocoa/12 bg-cream/80 px-4 py-3 text-sm text-charcoal/80 transition duration-300 hover:border-cocoa/25">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-cocoa"
      />
      {label}
    </label>
  );
}

export function SubmitBar({
  cancelHref,
  pending,
  label,
  error,
  disabled,
}: {
  cancelHref: string;
  pending: boolean;
  label: string;
  error?: string | null;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 border-t border-cocoa/12 pt-5 sm:flex-row sm:items-center sm:justify-between">
      {error ? (
        <p className="text-xs text-burnt-red">{error}</p>
      ) : (
        <span className="hidden sm:inline" />
      )}
      <div className="flex items-center gap-3 self-end">
        <Link
          href={cancelHref}
          className="inline-flex items-center rounded-full border border-cocoa/22 bg-cream px-4 py-2 text-[11px] font-medium uppercase tracking-[0.18em] text-cocoa transition duration-500 hover:border-cocoa"
        >
          cancel
        </Link>
        <button
          type="submit"
          disabled={pending || disabled}
          className="inline-flex items-center gap-2 rounded-full bg-cocoa px-5 py-2 text-[11px] font-medium uppercase tracking-[0.18em] text-cream shadow-[0_10px_28px_rgba(140,106,90,0.22)] transition duration-500 hover:bg-cocoa/90 disabled:opacity-50"
        >
          {pending ? "saving…" : label}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

/** Convert a title into a URL-safe slug. Used across create forms. */
export function slugify(title: string) {
  return title
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
