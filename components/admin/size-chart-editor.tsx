"use client";

import { Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { TextInput } from "@/components/admin/admin-form";
import {
  SIZE_CHART_LIMITS,
  addChartSize,
  isGridPaste,
  newSizeChart,
  pasteIntoSection,
  removeChartSize,
  type SizeChart,
  type SizeChartSection,
} from "@/lib/size-chart";
import { GARMENT_SIZE_ORDER } from "@/lib/sizes";

/**
 * Admin editor for a category's size chart (`categories.size_chart`).
 *
 * Controlled: the parent form owns the chart and decides when to save it.
 * `value === null` means "this category has no chart of its own" — its
 * products then use the default size guide. Layout mirrors how the chart is
 * shown to customers (and how a spreadsheet lays it out): sizes across the
 * top, one measurement per row, one table per section (e.g. Top / Bottom).
 *
 * A block copied from a spreadsheet can be pasted straight into the grid.
 */

const L = SIZE_CHART_LIMITS;

// text-base (not text-sm) below sm: — iOS Safari auto-zooms the page when a
// focused input computes to under 16px (same rule as components/admin/admin-form.tsx).
const cellClass =
  "block w-full rounded-lg border border-cocoa/20 bg-cream px-2 py-1.5 text-center text-base text-charcoal outline-none transition duration-300 focus:border-cocoa sm:text-sm";

const ghostButtonClass =
  "inline-flex items-center gap-2 rounded-full border border-cocoa/22 bg-cream px-4 py-2 text-[11px] font-medium uppercase tracking-[0.18em] text-cocoa transition duration-500 hover:border-cocoa disabled:opacity-50";

export function SizeChartEditor({
  value,
  onChange,
  problem,
}: {
  value: SizeChart | null;
  onChange: (next: SizeChart | null) => void;
  /** What's stopping the chart from saving right now, if anything. */
  problem?: string | null;
}) {
  const [customSize, setCustomSize] = useState("");

  if (!value) {
    return (
      <div className="md:col-span-2">
        <p className="text-sm text-charcoal/60">
          This category has no chart of its own, so its products show the
          default size guide (bust, waist, hip).
        </p>
        <button
          type="button"
          onClick={() => onChange(newSizeChart())}
          className={`${ghostButtonClass} mt-4`}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          add a size chart
        </button>
      </div>
    );
  }

  const chart = value;
  const sizeCount = chart.sizes.length;
  const customSizes = chart.sizes.filter((s) => !GARMENT_SIZE_ORDER.includes(s.toUpperCase()));

  function updateSection(si: number, fn: (s: SizeChartSection) => SizeChartSection) {
    onChange({
      ...chart,
      sections: chart.sections.map((sec, i) => (i === si ? fn(sec) : sec)),
    });
  }

  function toggleSize(size: string) {
    const has = chart.sizes.some((s) => s.toUpperCase() === size.toUpperCase());
    onChange(has ? removeChartSize(chart, size) : addChartSize(chart, size));
  }

  function addCustomSize() {
    const size = customSize.trim();
    if (!size) return;
    onChange(addChartSize(chart, size));
    setCustomSize("");
  }

  function addSection() {
    onChange({
      ...chart,
      sections: [
        ...chart.sections,
        { title: "", rows: [{ label: "", values: chart.sizes.map(() => "") }] },
      ],
    });
  }

  function removeSection(si: number) {
    onChange({ ...chart, sections: chart.sections.filter((_, i) => i !== si) });
  }

  function removeChart() {
    if (
      window.confirm(
        "Remove this size chart? Products in this category go back to the default size guide. Nothing changes on the site until you press Save changes.",
      )
    ) {
      onChange(null);
    }
  }

  return (
    // Enter inside a cell must not submit the whole category form (it would
    // save mid-typing) — it's the key people reach for to move between cells.
    <div
      className="space-y-6 md:col-span-2"
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.target instanceof HTMLInputElement) e.preventDefault();
      }}
    >
      <label className="block">
        <span className="block text-[11px] font-medium uppercase tracking-[0.16em] text-charcoal/55">
          Caption
        </span>
        <div className="mt-1.5">
          <TextInput
            value={chart.caption}
            maxLength={L.captionLength}
            onChange={(e) => onChange({ ...chart, caption: e.target.value })}
          />
        </div>
        <p className="mt-1 text-xs text-charcoal/50">
          The small line above &ldquo;Size guide&rdquo; — say what the numbers
          are (for example garment measurements in inches).
        </p>
      </label>

      {/* Sizes — the columns of every table */}
      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-charcoal/55">
          Sizes
        </p>
        <p className="mt-1 text-xs text-charcoal/50">
          Click to add or remove a size. Every table below shares these columns.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {GARMENT_SIZE_ORDER.map((s) => {
            const active = chart.sizes.some((x) => x.toUpperCase() === s);
            return (
              <button
                key={s}
                type="button"
                onClick={() => toggleSize(s)}
                aria-pressed={active}
                className={`rounded-full border px-4 py-2 text-sm uppercase tracking-wide transition duration-300 ${
                  active
                    ? "border-maroon bg-maroon text-cream"
                    : "border-cocoa/25 bg-cream text-charcoal/70 hover:border-cocoa"
                }`}
              >
                {s}
              </button>
            );
          })}
          {customSizes.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => toggleSize(s)}
              aria-label={`Remove size ${s}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-maroon bg-maroon px-4 py-2 text-sm tracking-wide text-cream"
            >
              {s}
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <input
            value={customSize}
            maxLength={L.sizeLength}
            onChange={(e) => setCustomSize(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustomSize();
              }
            }}
            placeholder="custom size (e.g. Free)"
            aria-label="Custom size"
            className="block w-full max-w-xs rounded-xl border border-cocoa/20 bg-cream px-4 py-2 text-base text-charcoal outline-none transition duration-500 focus:border-cocoa sm:text-sm"
          />
          <button
            type="button"
            onClick={addCustomSize}
            disabled={!customSize.trim() || sizeCount >= L.sizes}
            className={ghostButtonClass}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            add size
          </button>
        </div>
      </div>

      {/* Tables */}
      {sizeCount === 0 ? (
        <p className="rounded-xl border border-dashed border-cocoa/25 px-4 py-6 text-center text-sm text-charcoal/55">
          Add at least one size above to start filling in measurements.
        </p>
      ) : (
        <div className="space-y-5">
          <p className="text-xs text-charcoal/50">
            Tip: copy a block of numbers from a spreadsheet and paste it into a
            cell — it fills the grid from there. Paste into a row-name cell to
            bring the names in too.
          </p>
          {chart.sections.map((section, si) => {
            const where = section.title || `Table ${si + 1}`;
            return (
              <div
                key={si}
                className="rounded-2xl border border-cocoa/14 bg-cream p-4"
              >
                <div className="flex items-end gap-3">
                  <label className="min-w-0 flex-1">
                    <span className="block text-[11px] font-medium uppercase tracking-[0.16em] text-charcoal/55">
                      Table {si + 1} title
                    </span>
                    <div className="mt-1.5">
                      <TextInput
                        value={section.title}
                        maxLength={L.titleLength}
                        placeholder="e.g. Top"
                        onChange={(e) =>
                          updateSection(si, (s) => ({ ...s, title: e.target.value }))
                        }
                      />
                    </div>
                  </label>
                  {chart.sections.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => removeSection(si)}
                      aria-label={`Remove ${where}`}
                      className="mb-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-cocoa/22 text-cocoa transition duration-500 hover:border-burnt-red hover:text-burnt-red"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  ) : null}
                </div>

                <div className="mt-4 overflow-x-auto">
                  <table
                    className="w-full table-fixed border-separate border-spacing-x-1.5 border-spacing-y-1.5"
                    style={{ minWidth: 150 + sizeCount * 64 + 44 }}
                  >
                    <colgroup>
                      <col style={{ width: 150 }} />
                      {chart.sizes.map((s) => (
                        <col key={s} style={{ width: 64 }} />
                      ))}
                      <col style={{ width: 44 }} />
                    </colgroup>
                    <thead>
                      <tr>
                        <th className="text-left text-[10px] font-medium uppercase tracking-[0.16em] text-charcoal/50">
                          Measurement
                        </th>
                        {chart.sizes.map((s) => (
                          <th
                            key={s}
                            className="text-center text-[11px] font-medium uppercase tracking-[0.14em] text-cocoa"
                          >
                            {s}
                          </th>
                        ))}
                        <th>
                          <span className="sr-only">Remove row</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {section.rows.map((row, ri) => (
                        <tr key={ri}>
                          <td>
                            <input
                              value={row.label}
                              maxLength={L.labelLength}
                              placeholder="e.g. Bust"
                              aria-label={`${where}, row ${ri + 1} name`}
                              onChange={(e) =>
                                updateSection(si, (s) => ({
                                  ...s,
                                  rows: s.rows.map((r, i) =>
                                    i === ri ? { ...r, label: e.target.value } : r,
                                  ),
                                }))
                              }
                              onPaste={(e) => {
                                const text = e.clipboardData.getData("text");
                                if (!isGridPaste(text)) return;
                                e.preventDefault();
                                updateSection(si, (s) =>
                                  pasteIntoSection(s, sizeCount, ri, -1, text),
                                );
                              }}
                              className={`${cellClass} !text-left`}
                            />
                          </td>
                          {chart.sizes.map((size, ci) => (
                            <td key={size}>
                              <input
                                value={row.values[ci] ?? ""}
                                maxLength={L.valueLength}
                                aria-label={`${where}, ${row.label || `row ${ri + 1}`}, size ${size}`}
                                onChange={(e) =>
                                  updateSection(si, (s) => ({
                                    ...s,
                                    rows: s.rows.map((r, i) =>
                                      i === ri
                                        ? {
                                            ...r,
                                            values: r.values.map((v, j) =>
                                              j === ci ? e.target.value : v,
                                            ),
                                          }
                                        : r,
                                    ),
                                  }))
                                }
                                onPaste={(e) => {
                                  const text = e.clipboardData.getData("text");
                                  if (!isGridPaste(text)) return;
                                  e.preventDefault();
                                  updateSection(si, (s) =>
                                    pasteIntoSection(s, sizeCount, ri, ci, text),
                                  );
                                }}
                                className={cellClass}
                              />
                            </td>
                          ))}
                          <td className="text-center">
                            {section.rows.length > 1 ? (
                              <button
                                type="button"
                                onClick={() =>
                                  updateSection(si, (s) => ({
                                    ...s,
                                    rows: s.rows.filter((_, i) => i !== ri),
                                  }))
                                }
                                aria-label={`Remove ${where}, row ${ri + 1}`}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-charcoal/45 transition duration-300 hover:text-burnt-red"
                              >
                                <Trash2 className="h-4 w-4" aria-hidden="true" />
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    updateSection(si, (s) => ({
                      ...s,
                      rows: [...s.rows, { label: "", values: chart.sizes.map(() => "") }],
                    }))
                  }
                  disabled={section.rows.length >= L.rowsPerSection}
                  className={`${ghostButtonClass} mt-3`}
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  add row
                </button>
              </div>
            );
          })}

          {chart.sections.length < L.sections ? (
            <button type="button" onClick={addSection} className={ghostButtonClass}>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              add another table
            </button>
          ) : null}
        </div>
      )}

      {problem ? <p className="text-xs text-burnt-red">{problem}</p> : null}

      <div className="border-t border-cocoa/10 pt-4">
        <button
          type="button"
          onClick={removeChart}
          className="text-xs text-charcoal/55 underline decoration-cocoa/30 underline-offset-4 transition duration-300 hover:text-burnt-red"
        >
          Remove this chart and use the default size guide
        </button>
      </div>
    </div>
  );
}
