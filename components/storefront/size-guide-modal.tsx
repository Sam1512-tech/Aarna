"use client";

import { useId } from "react";
import { X } from "lucide-react";
import { createPortal } from "react-dom";
import { useModalLock } from "@/hooks/use-modal-lock";
import {
  DEFAULT_SIZE_CHART,
  FALLBACK_SIZE_CHART_CAPTION,
  findChartSizeIndex,
  type SizeChart,
} from "@/lib/size-chart";

/**
 * Size guide bottom-sheet / centered modal opened from the PDP "size help"
 * trigger.
 *
 * One layout for every category. A product shows its category's chart
 * (`categories.size_chart`, edited in the admin — see lib/size-chart.ts), or the
 * standard chart (`DEFAULT_SIZE_CHART`) when its category has none: sizes
 * across, measurements down, one table per section (e.g. Top / Bottom), with an
 * optional intro line and note boxes (fit, model height) above.
 */

interface SizeGuideModalProps {
  open: boolean;
  onClose: () => void;
  /** The product's category chart; null/undefined shows the standard chart. */
  chart?: SizeChart | null;
  /** The size currently picked on the page — highlighted in the chart. */
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

  const shown = chart ?? DEFAULT_SIZE_CHART;

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
              {shown.caption || FALLBACK_SIZE_CHART_CAPTION}
            </p>
            <h2
              id="size-guide-title"
              className="mt-3 font-display text-4xl leading-tight text-maroon md:text-5xl"
            >
              Size guide
            </h2>
          </div>

          <SizeChartBody chart={shown} selectedSize={selectedSize} />

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

function SizeChartBody({
  chart,
  selectedSize,
}: {
  chart: SizeChart;
  selectedSize?: string | null;
}) {
  const baseId = useId();
  const selectedIdx = findChartSizeIndex(chart, selectedSize);
  const minWidth = LABEL_COL_PX + chart.sizes.length * MIN_SIZE_COL_PX;

  const notes = chart.notes ?? [];

  return (
    <div className="mt-6 space-y-6">
      {notes.length > 0 ? (
        <dl
          className={`grid gap-3 rounded-2xl border border-cocoa/12 bg-cocoa/4 px-4 py-4 ${
            notes.length === 1 ? "grid-cols-1" : "grid-cols-2"
          }`}
        >
          {notes.map((note, i) => (
            <div key={i}>
              <dt className="text-[10px] font-medium uppercase tracking-[0.18em] text-charcoal/55">
                {note.label}
              </dt>
              <dd className="mt-0.5 text-sm text-charcoal/85">{note.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {chart.intro ? (
        <p className="text-center text-sm leading-6 text-charcoal/65">
          {chart.intro}
        </p>
      ) : null}

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
                // A titled section is named by its heading; an untitled one
                // would otherwise be an anonymous table to a screen reader.
                aria-label={section.title ? undefined : "Size chart"}
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
