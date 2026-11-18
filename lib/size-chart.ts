/**
 * Per-category size chart — the data shape, its validation, and the small pure
 * helpers the admin editor and the storefront share.
 *
 * Every category's size chart is the same kind of thing: data
 * (`categories.size_chart`, JSON) edited in the admin and drawn by one shared
 * table. A product's "Size guide" shows its category's chart, or
 * `DEFAULT_SIZE_CHART` (the standard bust/waist/hip chart) when the category
 * has none — so a new category works from day one and gets its own chart from
 * the admin with no code change. Nothing here knows any category's name.
 *
 * One chart = one shared list of sizes (the columns) plus one or more titled
 * sections (for example "Top" and "Bottom" for a two-piece category), each a
 * list of measurement rows with one value per size.
 *
 * Plain module (no "use server"/"use client"): the storefront modal, the admin
 * editor and the server action all import it.
 */
import { ActionError } from "@/lib/action-error";
import { GARMENT_SIZE_ORDER } from "@/lib/sizes";

export interface SizeChartRow {
  /** e.g. "Bust" */
  label: string;
  /** One entry per `SizeChart.sizes`, same order. "" renders as a dash. */
  values: string[];
}

export interface SizeChartSection {
  /** e.g. "Top". May be empty when the chart has a single section. */
  title: string;
  rows: SizeChartRow[];
}

/** A labelled fact shown in a box above the tables, e.g. "Fit type" / "Comfortable fit". */
export interface SizeChartNote {
  label: string;
  value: string;
}

export interface SizeChart {
  /** Small line above the title, e.g. "garment measurements in inches". */
  caption: string;
  /** Optional sentence under the title that tells people how to use the chart. */
  intro?: string;
  /** Optional labelled facts (fit type, model height…) shown above the tables. */
  notes?: SizeChartNote[];
  /** Column headers shared by every section, e.g. ["XS", "S", "M"]. */
  sizes: string[];
  sections: SizeChartSection[];
}

export const SIZE_CHART_LIMITS = {
  sizes: 10,
  sections: 4,
  rowsPerSection: 12,
  sizeLength: 6,
  titleLength: 40,
  labelLength: 40,
  valueLength: 8,
  captionLength: 80,
  introLength: 200,
  notes: 4,
  noteLabelLength: 30,
  noteValueLength: 60,
} as const;

/** Pre-filled when an admin starts a new chart. */
export const DEFAULT_SIZE_CHART_CAPTION = "garment measurements in inches";

/** Shown when a stored chart has no caption of its own. */
export const FALLBACK_SIZE_CHART_CAPTION = "measurements in inches";

function str(value: unknown, what: string): string {
  if (typeof value !== "string") {
    throw new ActionError(`Size chart: ${what} must be text.`);
  }
  return value.trim();
}

function checkLength(value: string, max: number, what: string): void {
  if (value.length > max) {
    throw new ActionError(`Size chart: ${what} can be at most ${max} characters.`);
  }
}

/**
 * Validates + normalises a chart (trims every string). Throws an ActionError
 * with a message fit to show an admin. Used by the admin action on write, and —
 * through `readSizeChart` — to defend the storefront against a malformed row.
 */
export function validateSizeChart(input: unknown): SizeChart {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new ActionError("Size chart: invalid chart.");
  }
  const raw = input as Record<string, unknown>;
  const L = SIZE_CHART_LIMITS;

  const caption = raw.caption === undefined ? "" : str(raw.caption, "the caption");
  checkLength(caption, L.captionLength, "the caption");

  const intro = raw.intro === undefined ? "" : str(raw.intro, "the intro");
  checkLength(intro, L.introLength, "the intro");

  const rawNotes = raw.notes === undefined ? [] : raw.notes;
  if (!Array.isArray(rawNotes)) {
    throw new ActionError("Size chart: the notes are invalid.");
  }
  if (rawNotes.length > L.notes) {
    throw new ActionError(`Size chart: at most ${L.notes} notes.`);
  }
  const notes = rawNotes.map((n, i): SizeChartNote => {
    if (typeof n !== "object" || n === null) {
      throw new ActionError(`Size chart: note ${i + 1} is invalid.`);
    }
    const note = n as Record<string, unknown>;
    const label = str(note.label, `note ${i + 1}'s label`);
    const value = str(note.value, `note ${i + 1}'s text`);
    if (!label || !value) {
      throw new ActionError(`Size chart: note ${i + 1} needs both a label and text.`);
    }
    checkLength(label, L.noteLabelLength, `note ${i + 1}'s label`);
    checkLength(value, L.noteValueLength, `note ${i + 1}'s text`);
    return { label, value };
  });

  if (!Array.isArray(raw.sizes) || raw.sizes.length === 0) {
    throw new ActionError("Size chart: add at least one size.");
  }
  if (raw.sizes.length > L.sizes) {
    throw new ActionError(`Size chart: at most ${L.sizes} sizes.`);
  }
  const sizes = raw.sizes.map((s, i) => {
    const size = str(s, `size ${i + 1}`);
    if (!size) throw new ActionError(`Size chart: size ${i + 1} is empty.`);
    checkLength(size, L.sizeLength, `size "${size}"`);
    return size;
  });
  const seen = new Set<string>();
  for (const size of sizes) {
    const key = size.toUpperCase();
    if (seen.has(key)) throw new ActionError(`Size chart: size "${size}" appears twice.`);
    seen.add(key);
  }

  if (!Array.isArray(raw.sections) || raw.sections.length === 0) {
    throw new ActionError("Size chart: add at least one table.");
  }
  if (raw.sections.length > L.sections) {
    throw new ActionError(`Size chart: at most ${L.sections} tables.`);
  }

  const sections = raw.sections.map((sec, si): SizeChartSection => {
    if (typeof sec !== "object" || sec === null) {
      throw new ActionError(`Size chart: table ${si + 1} is invalid.`);
    }
    const s = sec as Record<string, unknown>;
    const title = s.title === undefined ? "" : str(s.title, `table ${si + 1}'s title`);
    checkLength(title, L.titleLength, `table ${si + 1}'s title`);
    const where = title ? `table "${title}"` : `table ${si + 1}`;

    if (!Array.isArray(s.rows) || s.rows.length === 0) {
      throw new ActionError(`Size chart: ${where} needs at least one measurement row.`);
    }
    if (s.rows.length > L.rowsPerSection) {
      throw new ActionError(
        `Size chart: ${where} can have at most ${L.rowsPerSection} rows.`,
      );
    }

    const rows = s.rows.map((r, ri): SizeChartRow => {
      if (typeof r !== "object" || r === null) {
        throw new ActionError(`Size chart: row ${ri + 1} of ${where} is invalid.`);
      }
      const row = r as Record<string, unknown>;
      const label = str(row.label, `row ${ri + 1}'s name in ${where}`);
      if (!label) {
        throw new ActionError(`Size chart: row ${ri + 1} of ${where} needs a name.`);
      }
      checkLength(label, L.labelLength, `row name "${label}"`);

      if (!Array.isArray(row.values) || row.values.length !== sizes.length) {
        throw new ActionError(
          `Size chart: row "${label}" in ${where} needs one value per size.`,
        );
      }
      const values = row.values.map((v) => {
        // Numbers are accepted (and stringified) so a hand-written seed or an
        // import can say 27.5 rather than "27.5".
        const text = typeof v === "number" ? String(v) : str(v, `a value in "${label}"`);
        const trimmed = text.trim();
        checkLength(trimmed, L.valueLength, `the values in "${label}"`);
        return trimmed;
      });
      return { label, values };
    });

    return { title, rows };
  });

  // intro / notes are left out when empty, so a chart saved without them is
  // stored exactly as it was before they existed.
  return {
    caption,
    ...(intro ? { intro } : {}),
    ...(notes.length ? { notes } : {}),
    sizes,
    sections,
  };
}

/**
 * Reads a stored chart for display. A malformed row (hand-edited JSON, an old
 * shape) must never take a product page down — it just falls back to the
 * default chart, as if the category had none.
 */
export function readSizeChart(raw: unknown): SizeChart | null {
  if (raw === null || raw === undefined) return null;
  try {
    return validateSizeChart(raw);
  } catch {
    return null;
  }
}

// ── Editor helpers (pure, so they can be tested) ────────────────────────────

/** A starting point for an admin adding a chart: one empty table, no sizes. */
export function newSizeChart(): SizeChart {
  return {
    caption: DEFAULT_SIZE_CHART_CAPTION,
    sizes: [],
    sections: [{ title: "", rows: [{ label: "", values: [] }] }],
  };
}

function sizeRank(size: string): number {
  const idx = GARMENT_SIZE_ORDER.indexOf(size.trim().toUpperCase());
  return idx === -1 ? GARMENT_SIZE_ORDER.length : idx;
}

/**
 * Adds a size column in garment order (XS, S, M, L, XL, XXL; anything custom
 * goes after, in the order added) and gives every row an empty cell for it.
 * A size that's already there is a no-op.
 */
export function addChartSize(chart: SizeChart, size: string): SizeChart {
  const name = size.trim();
  if (!name) return chart;
  if (chart.sizes.some((s) => s.toUpperCase() === name.toUpperCase())) return chart;

  // Insert before the first existing size that ranks strictly later; custom
  // sizes all share the last rank, so a new custom size lands at the end.
  const rank = sizeRank(name);
  let at = chart.sizes.findIndex((s) => sizeRank(s) > rank);
  if (at === -1) at = chart.sizes.length;

  return {
    ...chart,
    sizes: [...chart.sizes.slice(0, at), name, ...chart.sizes.slice(at)],
    sections: chart.sections.map((sec) => ({
      ...sec,
      rows: sec.rows.map((row) => ({
        ...row,
        values: [...row.values.slice(0, at), "", ...row.values.slice(at)],
      })),
    })),
  };
}

/** Removes a size column and its cell from every row. */
export function removeChartSize(chart: SizeChart, size: string): SizeChart {
  const at = chart.sizes.findIndex((s) => s.toUpperCase() === size.trim().toUpperCase());
  if (at === -1) return chart;
  return {
    ...chart,
    sizes: chart.sizes.filter((_, i) => i !== at),
    sections: chart.sections.map((sec) => ({
      ...sec,
      rows: sec.rows.map((row) => ({
        ...row,
        values: row.values.filter((_, i) => i !== at),
      })),
    })),
  };
}

/**
 * Index of the column matching a product's selected size (case-insensitive),
 * or -1. Lets the storefront highlight the size the customer has picked.
 */
export function findChartSizeIndex(chart: SizeChart, size: string | null | undefined): number {
  if (!size) return -1;
  const key = size.trim().toUpperCase();
  return chart.sizes.findIndex((s) => s.toUpperCase() === key);
}

/** The first problem that would stop a chart saving, or null when it's valid. */
export function sizeChartProblem(chart: SizeChart): string | null {
  try {
    validateSizeChart(chart);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : "This chart can't be saved.";
  }
}

/** True when pasted text looks like a block copied from a spreadsheet. */
export function isGridPaste(text: string): boolean {
  return /[\t\n\r]/.test(text.replace(/[\r\n]+$/, ""));
}

/**
 * Fills a table from a block copied out of a spreadsheet (cells separated by
 * tabs, rows by newlines), starting at the cell it was pasted into.
 * `startCol` is -1 for the row-name column, otherwise the size's index — so
 * pasting into the name column takes the first copied column as names and the
 * rest as values, and pasting into a value cell fills values only. Cells past
 * the last size are ignored; rows past the end of the table are added only when
 * pasting into the name column (a value paste never invents rows).
 */
export function pasteIntoSection(
  section: SizeChartSection,
  sizeCount: number,
  startRow: number,
  startCol: number,
  text: string,
): SizeChartSection {
  const lines = text.split(/\r\n|\n|\r/);
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();

  const rows = section.rows.map((r) => ({ label: r.label, values: [...r.values] }));

  lines.forEach((line, r) => {
    const target = startRow + r;
    if (target >= rows.length) {
      if (startCol !== -1 || rows.length >= SIZE_CHART_LIMITS.rowsPerSection) return;
      rows.push({ label: "", values: Array.from({ length: sizeCount }, () => "") });
    }
    line.split("\t").forEach((cell, c) => {
      const col = startCol + c;
      const text = cell.trim();
      if (col === -1) rows[target].label = text;
      else if (col >= 0 && col < sizeCount) rows[target].values[col] = text;
    });
  });

  return { ...section, rows };
}

/**
 * Splits a category row into the two things a product page needs from it:
 * the public `category` (null while the category is hidden — its /shop page
 * 404s, so the page must not link to it) and the `sizeChart` (which is
 * returned even for a hidden category, so a product that goes live before its
 * category still shows its own category's chart). `sizeChart` is stripped from
 * the returned category so it never rides along in props twice.
 */
export function resolveProductCategory<
  T extends { isActive: boolean; sizeChart?: unknown },
>(row: T | null): { category: Omit<T, "sizeChart"> | null; sizeChart: SizeChart | null } {
  if (!row) return { category: null, sizeChart: null };
  const { sizeChart, ...category } = row;
  return {
    category: row.isActive ? category : null,
    sizeChart: readSizeChart(sizeChart),
  };
}

/**
 * The standard chart: what every product's Size guide showed before categories
 * had charts of their own (body bust / waist / hip, XS–XXL, plus the fit and
 * model notes). It is the fallback for a category with no chart, and the
 * starting point the admin editor offers ("start from the standard chart").
 * Same numbers and wording as before — only the layout is the shared one.
 */
export const DEFAULT_SIZE_CHART: SizeChart = {
  caption: FALLBACK_SIZE_CHART_CAPTION,
  intro:
    "We've laid out body measurements so you can pick the size that feels closest to yours.",
  notes: [
    { label: "Fit type", value: "Comfortable fit" },
    { label: "Model height", value: "5'6\" · Wearing XS" },
  ],
  sizes: ["XS", "S", "M", "L", "XL", "XXL"],
  sections: [
    {
      title: "",
      rows: [
        { label: "Bust", values: ["32", "34", "36", "38", "40", "42"] },
        { label: "Waist", values: ["26", "28", "30", "32", "34", "36"] },
        { label: "Hip", values: ["36", "38", "40", "42", "44", "46"] },
      ],
    },
  ],
};

/** A fresh, independent copy of the standard chart for the editor to change. */
export function standardSizeChart(): SizeChart {
  return JSON.parse(JSON.stringify(DEFAULT_SIZE_CHART)) as SizeChart;
}

/**
 * A canonical string for a chart (or none), the same whatever order its keys
 * were built in — so "has this chart changed?" compares content, not how the
 * object happened to be assembled. Does not validate.
 */
export function chartSignature(chart: SizeChart | null): string {
  if (!chart) return "null";
  return JSON.stringify([
    chart.caption,
    chart.intro ?? "",
    (chart.notes ?? []).map((n) => [n.label, n.value]),
    chart.sizes,
    chart.sections.map((sec) => [sec.title, sec.rows.map((r) => [r.label, r.values])]),
  ]);
}
