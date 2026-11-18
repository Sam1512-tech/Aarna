"use client";

import { useId } from "react";
import { Ruler, User, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useModalLock } from "@/hooks/use-modal-lock";
import {
  FALLBACK_SIZE_CHART_CAPTION,
  findChartSizeIndex,
  type SizeChart,
} from "@/lib/size-chart";

/**
 * Size guide bottom-sheet / centered modal opened from the PDP "size help"
 * trigger.
 *
 * Two charts, one modal. A product whose category has its own chart
 * (`categories.size_chart`, edited in the admin — see lib/size-chart.ts) shows
 * that, sizes across and measurements down, one table per section (e.g. Top /
 * Bottom). Every other product shows the built-in bust/waist/hip chart below,
 * hardcoded and shared, exactly as before.
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
  { size: "XXL", bust: 42, waist: 36, hip: 46 },
];

interface SizeGuideModalProps {
  open: boolean;
  onClose: () => void;
  /** The product's category chart; null/undefined shows the default chart. */
  chart?: SizeChart | null;
  /** The size currently picked on the page — highlighted in a category chart. */
  selectedSize?: string | null;
}

export function SizeGuideModal({
  open,
  onClose,
  chart,
  selectedSize,
}: SizeGuideModalProps) {
  useModalLock(open, onClose);

  if (!open) return null;

  // Portaled to document.body — escapes the `.paper-grain` (app/globals.css)
  // `isolation: isolate` stacking-context trap that any inline (non-portaled)
  // `fixed` modal falls into on this and every other paper-grain-wrapped
  // page (PDP included), which otherwise prevents it from ever painting
  // above the site's own fixed header regardless of z-index. This modal
  // previously dodged the symptom on mobile only, by reserving a hardcoded
  // ~110px of top space to avoid ever overlapping the header's known height
  // — fragile (breaks if the header grows) and never applied on desktop.
  // The portal fixes the actual mechanism, so that reservation is no longer
  // needed; back to a plain dvh/vh max-height like the other modals.
  return createPortal(
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

      {/* dvh (not vh) on mobile — mobile Safari/Chrome's collapsing URL bar
          means plain vh can size this taller than what's actually visible. */}
      <div className="relative z-10 flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-t-[28px] bg-cream shadow-[0_-18px_60px_rgba(43,38,35,0.16)] md:max-h-[92vh] md:rounded-[28px]">
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

        {/* Extra bottom clearance for the iPhone home-indicator safe area
            (the app opts into viewport-fit=cover) — same fix already
            applied to the cart toast + return-exchange-modal footer. */}
        <div
          className="overflow-y-auto px-6 pt-6 md:px-10 md:pt-10"
          style={{ paddingBottom: "calc(2rem + env(safe-area-inset-bottom))" }}
        >
          {/* Header */}
          <div className="text-center">
            <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-cocoa">
              {chart
                ? chart.caption || FALLBACK_SIZE_CHART_CAPTION
                : "measurements in inches"}
            </p>
            <h2
              id="size-guide-title"
              className="mt-3 font-display text-4xl leading-tight text-maroon md:text-5xl"
            >
              Size guide
            </h2>
          </div>

          {chart ? (
            <CategorySizeChart chart={chart} selectedSize={selectedSize} />
          ) : (
            <>
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
                      Comfortable fit
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
                      5&apos;6&quot; · Wearing XS
                    </p>
                  </div>
                </div>
              </div>

              <p className="mt-5 text-center text-sm leading-6 text-charcoal/65">
                We&apos;ve laid out body measurements so you can pick the size
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
            </>
          )}

          <p className="mt-5 text-center text-xs leading-5 text-charcoal/55">
            Still unsure? Drop us a note at{" "}
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
    </div>,
    document.body,
  );
}

// Widths used to keep a category chart readable on a phone: the label column
// is fixed, and each size gets at least MIN_SIZE_COL_PX — a chart with more
// sizes than fit scrolls sideways inside its own box rather than squashing.
const LABEL_COL_PX = 104;
const MIN_SIZE_COL_PX = 36;

function CategorySizeChart({
  chart,
  selectedSize,
}: {
  chart: SizeChart;
  selectedSize?: string | null;
}) {
  const baseId = useId();
  const selectedIdx = findChartSizeIndex(chart, selectedSize);
  const minWidth = LABEL_COL_PX + chart.sizes.length * MIN_SIZE_COL_PX;

  return (
    <div className="mt-6 space-y-6">
      {chart.sections.map((section, si) => {
        const titleId = `${baseId}-${si}`;
        return (
          <section
            key={si}
            aria-labelledby={section.title ? titleId : undefined}
          >
            {section.title ? (
              <h3
                id={titleId}
                className="mb-2 text-[10px] font-medium uppercase tracking-[0.24em] text-cocoa"
              >
                {section.title}
              </h3>
            ) : null}
            <div className="overflow-x-auto rounded-2xl border border-cocoa/14 bg-cream">
              <table
                className="w-full table-fixed text-[13px]"
                style={{ minWidth }}
              >
                <colgroup>
                  <col style={{ width: LABEL_COL_PX }} />
                  {chart.sizes.map((size) => (
                    <col key={size} />
                  ))}
                </colgroup>
                <thead>
                  <tr className="border-b border-cocoa/12 bg-cocoa/6">
                    <th scope="col" className="py-3 pl-4">
                      <span className="sr-only">Measurement</span>
                    </th>
                    {chart.sizes.map((size, i) => (
                      <th
                        key={size}
                        scope="col"
                        className={`py-3 text-center text-[10px] font-medium uppercase tracking-[0.18em] ${
                          i === selectedIdx
                            ? "bg-cocoa/12 text-maroon"
                            : "text-cocoa"
                        }`}
                      >
                        {size}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {section.rows.map((row, ri) => (
                    <tr
                      key={ri}
                      className={
                        ri < section.rows.length - 1
                          ? "border-b border-cocoa/10"
                          : ""
                      }
                    >
                      <th
                        scope="row"
                        className="py-3 pl-4 pr-2 text-left text-[13px] font-normal leading-4 text-charcoal/85"
                      >
                        {row.label}
                      </th>
                      {row.values.map((value, i) => (
                        <td
                          key={i}
                          className={`py-3 text-center tabular-nums ${
                            i === selectedIdx
                              ? "bg-cocoa/12 font-medium text-maroon"
                              : "text-charcoal/85"
                          }`}
                        >
                          {value || "–"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}

      {selectedIdx >= 0 ? (
        <p className="text-center text-xs leading-5 text-charcoal/55">
          Your selected size, {chart.sizes[selectedIdx]}, is highlighted.
        </p>
      ) : null}
    </div>
  );
}
