"use client";

import { useEffect } from "react";
import { Ruler, User, X } from "lucide-react";

/**
 * Size guide bottom-sheet / centered modal opened from the PDP "size help"
 * trigger. Values are hardcoded (shared across every product) — Aarna's
 * launch catalog is small enough that one chart covers all pieces. If per-
 * product measurements are ever needed, take a `chart` prop and pass it in.
 */

interface Row {
  size: string;
  bust: number;
  waist: number;
  hip: number;
}

const CHART: Row[] = [
  { size: "XS", bust: 32, waist: 26, hip: 36 },
  { size: "S", bust: 34, waist: 28, hip: 38 },
  { size: "M", bust: 36, waist: 30, hip: 40 },
  { size: "L", bust: 38, waist: 32, hip: 42 },
  { size: "XL", bust: 40, waist: 34, hip: 44 },
];

interface SizeGuideModalProps {
  open: boolean;
  onClose: () => void;
}

export function SizeGuideModal({ open, onClose }: SizeGuideModalProps) {
  // Close on Escape + lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="size-guide-title"
      className="fixed inset-0 z-[110] flex items-end justify-center bg-charcoal/40 backdrop-blur-sm md:items-center md:p-6"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close size guide"
        className="absolute inset-0"
      />

      {/* Mobile: panel height reserves ~110px at the top for the sticky
          site header (36px marquee + ~72px main header). Using dvh (dynamic
          viewport height) so mobile Chrome/Safari's collapsing URL bar
          doesn't clip the panel content. Desktop keeps the original 92vh
          since the modal is centered and has md:p-6 breathing room. */}
      <div className="relative z-10 flex max-h-[calc(100dvh-110px)] w-full max-w-md flex-col overflow-hidden rounded-t-[28px] bg-cream shadow-[0_-18px_60px_rgba(43,38,35,0.16)] md:max-h-[92vh] md:rounded-[28px]">
        {/* Grabber (mobile only) — signals bottom-sheet affordance */}
        <div className="flex justify-center pt-3 md:hidden" aria-hidden="true">
          <span className="h-1 w-10 rounded-full bg-cocoa/22" />
        </div>

        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full border border-cocoa/22 bg-cream text-cocoa transition duration-500 hover:border-cocoa hover:bg-cocoa/6"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>

        <div className="overflow-y-auto px-6 pb-8 pt-6 md:px-10 md:pt-10">
          {/* Header */}
          <div className="text-center">
            <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-cocoa">
              measurements in inches
            </p>
            <h2
              id="size-guide-title"
              className="mt-3 font-display text-4xl leading-tight text-maroon md:text-5xl"
            >
              size guide
            </h2>
          </div>

          {/* Fit + model info */}
          <div className="mt-6 grid grid-cols-2 gap-3 rounded-2xl border border-cocoa/12 bg-cocoa/4 px-4 py-4">
            <div className="flex items-start gap-2.5">
              <Ruler
                className="mt-0.5 h-4 w-4 shrink-0 text-cocoa"
                aria-hidden="true"
              />
              <div>
                <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-charcoal/55">
                  fit type
                </p>
                <p className="mt-0.5 text-sm text-charcoal/85">
                  comfortable fit
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <User
                className="mt-0.5 h-4 w-4 shrink-0 text-cocoa"
                aria-hidden="true"
              />
              <div>
                <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-charcoal/55">
                  model height
                </p>
                <p className="mt-0.5 text-sm text-charcoal/85">
                  5&apos;6&quot; · wearing S
                </p>
              </div>
            </div>
          </div>

          <p className="mt-5 text-center text-sm leading-6 text-charcoal/65">
            we&apos;ve laid out body measurements so you can pick the size
            that feels closest to yours.
          </p>

          {/* Chart */}
          <div className="mt-6 overflow-hidden rounded-2xl border border-cocoa/14 bg-cream">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-cocoa/12 bg-cocoa/6">
                  <th
                    scope="col"
                    className="px-4 py-3 text-left text-[10px] font-medium uppercase tracking-[0.18em] text-cocoa"
                  >
                    size
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-right text-[10px] font-medium uppercase tracking-[0.18em] text-cocoa"
                  >
                    bust
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-right text-[10px] font-medium uppercase tracking-[0.18em] text-cocoa"
                  >
                    waist
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-right text-[10px] font-medium uppercase tracking-[0.18em] text-cocoa"
                  >
                    hip
                  </th>
                </tr>
              </thead>
              <tbody>
                {CHART.map((row, i) => (
                  <tr
                    key={row.size}
                    className={
                      i < CHART.length - 1 ? "border-b border-cocoa/10" : ""
                    }
                  >
                    <th
                      scope="row"
                      className="px-4 py-3.5 text-left font-display text-base font-medium text-maroon"
                    >
                      {row.size}
                    </th>
                    <td className="px-4 py-3.5 text-right tabular-nums text-charcoal/85">
                      {row.bust}
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums text-charcoal/85">
                      {row.waist}
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums text-charcoal/85">
                      {row.hip}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-5 text-center text-xs leading-5 text-charcoal/55">
            still unsure? drop us a note at{" "}
            <a
              href="mailto:hello@shopaarna.in"
              className="soft-link text-cocoa"
            >
              hello@shopaarna.in
            </a>{" "}
            and we&apos;ll help you decide.
          </p>
        </div>
      </div>
    </div>
  );
}
