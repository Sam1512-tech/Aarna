/**
 * Per-category size chart — the data shape, its validation, and the small pure
 * helpers the admin editor and the storefront share.
 *
 * A category can carry its own chart (`categories.size_chart`, JSON). A
 * product's "Size guide" opens its category's chart when it has one and the
 * built-in bust/waist/hip chart otherwise, so a new category gets its own chart
 * from the admin with no code change — nothing here knows any category's name.
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

export interface SizeChart {
  /** Small line above the title, e.g. "garment measurements in inches". */
  caption: string;
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

  return { caption, sizes, sections };
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
