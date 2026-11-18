import { describe, expect, it } from "vitest";
import {
  DEFAULT_SIZE_CHART,
  SIZE_CHART_LIMITS,
  addChartSize,
  chartSignature,
  findChartSizeIndex,
  isGridPaste,
  newSizeChart,
  pasteIntoSection,
  readSizeChart,
  removeChartSize,
  resolveProductCategory,
  sizeChartProblem,
  standardSizeChart,
  validateSizeChart,
  type SizeChart,
  type SizeChartSection,
} from "./size-chart";

/** The two-piece chart the client sent, as the editor would produce it. */
const SETS_CHART: SizeChart = {
  caption: "garment measurements in inches",
  sizes: ["XS", "S", "M", "L", "XL", "XXL"],
  sections: [
    {
      title: "Top",
      rows: [
        { label: "Top length", values: ["27.5", "27.5", "27.5", "27.5", "27.5", "27.5"] },
        { label: "Bust", values: ["34", "36", "38", "40", "42", "44"] },
        { label: "Waist", values: ["35", "37", "39", "41", "43", "45"] },
        { label: "Shoulder", values: ["13.5", "14.5", "15.5", "16.5", "17.5", "18.5"] },
        { label: "Sleeve length", values: ["23", "23", "23", "23", "24", "24"] },
      ],
    },
    {
      title: "Bottom",
      rows: [
        { label: "Length", values: ["39", "39", "39", "39", "39", "39"] },
        { label: "Waist", values: ["26", "28", "30", "32", "34", "36"] },
      ],
    },
  ],
};

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

describe("validateSizeChart", () => {
  it("accepts the real two-piece chart unchanged", () => {
    expect(validateSizeChart(SETS_CHART)).toEqual(SETS_CHART);
  });

  it("trims every string", () => {
    const messy = clone(SETS_CHART);
    messy.caption = "  garment measurements in inches ";
    messy.sizes[0] = " XS ";
    messy.sections[0].title = " Top ";
    messy.sections[0].rows[0].label = " Top length ";
    messy.sections[0].rows[0].values[0] = " 27.5 ";
    const out = validateSizeChart(messy);
    expect(out).toEqual(SETS_CHART);
  });

  it("accepts numbers as values and stringifies them", () => {
    const chart = clone(SETS_CHART) as unknown as { sections: { rows: { values: unknown[] }[] }[] };
    chart.sections[0].rows[0].values = [27.5, 27.5, 27.5, 27.5, 27.5, 27.5];
    const out = validateSizeChart(chart);
    expect(out.sections[0].rows[0].values[0]).toBe("27.5");
  });

  it("allows empty cells and an empty title", () => {
    const chart = clone(SETS_CHART);
    chart.sections[0].title = "";
    chart.sections[0].rows[0].values[2] = "";
    expect(() => validateSizeChart(chart)).not.toThrow();
  });

  it("allows an empty caption (the storefront falls back)", () => {
    const chart = clone(SETS_CHART);
    chart.caption = "";
    expect(validateSizeChart(chart).caption).toBe("");
  });

  it.each([
    ["null", null],
    ["an array", []],
    ["a string", "chart"],
  ])("rejects %s", (_name, input) => {
    expect(() => validateSizeChart(input)).toThrow(/invalid chart/);
  });

  it("requires at least one size", () => {
    const chart = clone(SETS_CHART);
    chart.sizes = [];
    expect(() => validateSizeChart(chart)).toThrow(/at least one size/);
  });

  it("rejects an empty size", () => {
    const chart = clone(SETS_CHART);
    chart.sizes[1] = "  ";
    expect(() => validateSizeChart(chart)).toThrow(/size 2 is empty/);
  });

  it("rejects the same size twice, ignoring case", () => {
    const chart = clone(SETS_CHART);
    chart.sizes[1] = "xs";
    expect(() => validateSizeChart(chart)).toThrow(/appears twice/);
  });

  it("caps the number of sizes", () => {
    const chart = clone(SETS_CHART);
    chart.sizes = Array.from({ length: SIZE_CHART_LIMITS.sizes + 1 }, (_, i) => `S${i}`);
    expect(() => validateSizeChart(chart)).toThrow(/at most 10 sizes/);
  });

  it("requires at least one table, and caps tables", () => {
    const none = clone(SETS_CHART);
    none.sections = [];
    expect(() => validateSizeChart(none)).toThrow(/at least one table/);

    const many = clone(SETS_CHART);
    many.sections = Array.from({ length: SIZE_CHART_LIMITS.sections + 1 }, () =>
      clone(SETS_CHART.sections[0]),
    );
    expect(() => validateSizeChart(many)).toThrow(/at most 4 tables/);
  });

  it("requires every table to have a row, and caps rows", () => {
    const none = clone(SETS_CHART);
    none.sections[1].rows = [];
    expect(() => validateSizeChart(none)).toThrow(/"Bottom" needs at least one measurement row/);

    const many = clone(SETS_CHART);
    many.sections[0].rows = Array.from({ length: SIZE_CHART_LIMITS.rowsPerSection + 1 }, () =>
      clone(SETS_CHART.sections[0].rows[0]),
    );
    expect(() => validateSizeChart(many)).toThrow(/at most 12 rows/);
  });

  it("requires every row to have a name", () => {
    const chart = clone(SETS_CHART);
    chart.sections[0].rows[1].label = " ";
    expect(() => validateSizeChart(chart)).toThrow(/row 2 of table "Top" needs a name/);
  });

  it("requires exactly one value per size in every row", () => {
    const short = clone(SETS_CHART);
    short.sections[1].rows[0].values.pop();
    expect(() => validateSizeChart(short)).toThrow(/"Length".*one value per size/);

    const long = clone(SETS_CHART);
    long.sections[1].rows[0].values.push("40");
    expect(() => validateSizeChart(long)).toThrow(/one value per size/);
  });

  it("rejects text that is too long", () => {
    const long = (n: number) => "x".repeat(n);

    const caption = clone(SETS_CHART);
    caption.caption = long(SIZE_CHART_LIMITS.captionLength + 1);
    expect(() => validateSizeChart(caption)).toThrow(/caption/);

    const size = clone(SETS_CHART);
    size.sizes[0] = long(SIZE_CHART_LIMITS.sizeLength + 1);
    expect(() => validateSizeChart(size)).toThrow(/size "/);

    const title = clone(SETS_CHART);
    title.sections[0].title = long(SIZE_CHART_LIMITS.titleLength + 1);
    expect(() => validateSizeChart(title)).toThrow(/title/);

    const label = clone(SETS_CHART);
    label.sections[0].rows[0].label = long(SIZE_CHART_LIMITS.labelLength + 1);
    expect(() => validateSizeChart(label)).toThrow(/row name/);

    const value = clone(SETS_CHART);
    value.sections[0].rows[0].values[0] = long(SIZE_CHART_LIMITS.valueLength + 1);
    expect(() => validateSizeChart(value)).toThrow(/values in/);
  });

  it("rejects non-text where text is expected", () => {
    const chart = clone(SETS_CHART) as unknown as { sizes: unknown[] };
    chart.sizes[0] = 42;
    expect(() => validateSizeChart(chart)).toThrow(/must be text/);
  });
});

describe("readSizeChart", () => {
  it("returns a valid chart", () => {
    expect(readSizeChart(SETS_CHART)).toEqual(SETS_CHART);
  });

  it("returns null for nothing stored", () => {
    expect(readSizeChart(null)).toBeNull();
    expect(readSizeChart(undefined)).toBeNull();
  });

  it("returns null — never throws — for a malformed stored value", () => {
    expect(readSizeChart({ sizes: "nope" })).toBeNull();
    expect(readSizeChart("garbage")).toBeNull();
    const badRow = clone(SETS_CHART);
    badRow.sections[0].rows[0].values.pop();
    expect(readSizeChart(badRow)).toBeNull();
  });
});

describe("addChartSize", () => {
  it("inserts preset sizes in garment order and gives every row an empty cell", () => {
    let chart = newSizeChart();
    for (const s of ["XL", "S", "M"]) chart = addChartSize(chart, s);
    expect(chart.sizes).toEqual(["S", "M", "XL"]);
    expect(chart.sections[0].rows[0].values).toEqual(["", "", ""]);
  });

  it("keeps existing values attached to their size when a size is inserted before them", () => {
    let chart = addChartSize(addChartSize(newSizeChart(), "M"), "L");
    chart.sections[0].rows[0].values = ["38", "40"];
    chart = addChartSize(chart, "S");
    expect(chart.sizes).toEqual(["S", "M", "L"]);
    expect(chart.sections[0].rows[0].values).toEqual(["", "38", "40"]);
  });

  it("puts custom sizes after the presets, in the order added", () => {
    let chart = addChartSize(newSizeChart(), "M");
    chart = addChartSize(chart, "Free Size");
    chart = addChartSize(chart, "34");
    chart = addChartSize(chart, "XS");
    expect(chart.sizes).toEqual(["XS", "M", "Free Size", "34"]);
  });

  it("ignores a size already present (any case) and a blank one", () => {
    const chart = addChartSize(newSizeChart(), "M");
    expect(addChartSize(chart, "m")).toBe(chart);
    expect(addChartSize(chart, "  ")).toBe(chart);
  });

  it("does not mutate its input", () => {
    const chart = addChartSize(newSizeChart(), "M");
    const before = clone(chart);
    addChartSize(chart, "S");
    expect(chart).toEqual(before);
  });
});

describe("removeChartSize", () => {
  it("removes the column and each row's cell for it", () => {
    const out = removeChartSize(SETS_CHART, "M");
    expect(out.sizes).toEqual(["XS", "S", "L", "XL", "XXL"]);
    expect(out.sections[0].rows[1].values).toEqual(["34", "36", "40", "42", "44"]);
    expect(out.sections[1].rows[1].values).toEqual(["26", "28", "32", "34", "36"]);
  });

  it("is a no-op for a size that isn't there", () => {
    expect(removeChartSize(SETS_CHART, "XXXL")).toBe(SETS_CHART);
  });

  it("round-trips with addChartSize, losing only the removed column's values", () => {
    const removed = removeChartSize(SETS_CHART, "M");
    const readded = addChartSize(removed, "M");
    expect(readded.sizes).toEqual(SETS_CHART.sizes);
    expect(readded.sections[0].rows[1].values).toEqual(["34", "36", "", "40", "42", "44"]);
  });
});

describe("findChartSizeIndex", () => {
  it("finds the selected size, ignoring case and spacing", () => {
    expect(findChartSizeIndex(SETS_CHART, "M")).toBe(2);
    expect(findChartSizeIndex(SETS_CHART, " xl ")).toBe(4);
  });

  it("returns -1 when there is no match or no selection", () => {
    expect(findChartSizeIndex(SETS_CHART, "XXXL")).toBe(-1);
    expect(findChartSizeIndex(SETS_CHART, null)).toBe(-1);
    expect(findChartSizeIndex(SETS_CHART, undefined)).toBe(-1);
    expect(findChartSizeIndex(SETS_CHART, "")).toBe(-1);
  });
});

describe("isGridPaste", () => {
  it("is true for a block copied from a spreadsheet, false for a single value", () => {
    expect(isGridPaste("34\t36\t38")).toBe(true);
    expect(isGridPaste("34\n35")).toBe(true);
    expect(isGridPaste("34")).toBe(false);
    expect(isGridPaste("13.5\n")).toBe(false); // a lone cell copied with its trailing newline
  });
});

describe("pasteIntoSection", () => {
  const empty = (): SizeChartSection => ({
    title: "Top",
    rows: [
      { label: "Bust", values: ["", "", ""] },
      { label: "Waist", values: ["", "", ""] },
    ],
  });

  it("fills values from the pasted cell across and down", () => {
    const out = pasteIntoSection(empty(), 3, 0, 0, "34\t36\t38\n35\t37\t39");
    expect(out.rows[0]).toEqual({ label: "Bust", values: ["34", "36", "38"] });
    expect(out.rows[1]).toEqual({ label: "Waist", values: ["35", "37", "39"] });
  });

  it("starts at the cell it was pasted into and ignores cells past the last size", () => {
    const out = pasteIntoSection(empty(), 3, 1, 1, "37\t39\t41\t43");
    expect(out.rows[1].values).toEqual(["", "37", "39"]);
    expect(out.rows[0].values).toEqual(["", "", ""]);
  });

  it("never invents rows when pasting values", () => {
    const out = pasteIntoSection(empty(), 3, 1, 0, "1\t2\t3\n4\t5\t6\n7\t8\t9");
    expect(out.rows).toHaveLength(2);
    expect(out.rows[1].values).toEqual(["1", "2", "3"]);
  });

  it("pasting into the name column takes names then values, and adds rows as needed", () => {
    const out = pasteIntoSection(
      empty(),
      3,
      0,
      -1,
      "Top length\t27.5\t27.5\t27.5\nBust\t34\t36\t38\nShoulder\t13.5\t14.5\t15.5",
    );
    expect(out.rows.map((r) => r.label)).toEqual(["Top length", "Bust", "Shoulder"]);
    expect(out.rows[2].values).toEqual(["13.5", "14.5", "15.5"]);
  });

  it("does not add rows past the per-table limit", () => {
    const lines = Array.from({ length: 20 }, (_, i) => `Row ${i}\t1\t2\t3`).join("\n");
    const out = pasteIntoSection(empty(), 3, 0, -1, lines);
    expect(out.rows).toHaveLength(SIZE_CHART_LIMITS.rowsPerSection);
  });

  it("drops the trailing newline spreadsheets add and trims cells", () => {
    const out = pasteIntoSection(empty(), 3, 0, 0, " 34 \t36\t38\r\n");
    expect(out.rows[0].values).toEqual(["34", "36", "38"]);
    expect(out.rows[1].values).toEqual(["", "", ""]);
  });

  it("does not mutate its input", () => {
    const section = empty();
    const before = clone(section);
    pasteIntoSection(section, 3, 0, 0, "1\t2\t3");
    expect(section).toEqual(before);
  });
});

describe("sizeChartProblem", () => {
  it("is null for a valid chart and a readable message otherwise", () => {
    expect(sizeChartProblem(SETS_CHART)).toBeNull();
    expect(sizeChartProblem(newSizeChart())).toMatch(/at least one size/);
  });
});

describe("resolveProductCategory", () => {
  const row = (over: Record<string, unknown> = {}) => ({
    id: "c1",
    slug: "sets",
    name: "Sets",
    isActive: true,
    sizeChart: SETS_CHART as unknown,
    ...over,
  });

  it("returns the lean category and the chart for an active category", () => {
    const out = resolveProductCategory(row());
    expect(out.category).toEqual({ id: "c1", slug: "sets", name: "Sets", isActive: true });
    expect("sizeChart" in (out.category as object)).toBe(false);
    expect(out.sizeChart).toEqual(SETS_CHART);
  });

  it("hides a hidden category but still returns its chart", () => {
    const out = resolveProductCategory(row({ isActive: false }));
    expect(out.category).toBeNull();
    expect(out.sizeChart).toEqual(SETS_CHART);
  });

  it("gives null chart for a category without one", () => {
    expect(resolveProductCategory(row({ sizeChart: null })).sizeChart).toBeNull();
    expect(resolveProductCategory(row({ sizeChart: undefined })).sizeChart).toBeNull();
  });

  it("never throws on a malformed stored chart — falls back to the default (null)", () => {
    const out = resolveProductCategory(row({ sizeChart: { sizes: "nope" } }));
    expect(out.sizeChart).toBeNull();
    expect(out.category).not.toBeNull();
  });

  it("handles a product with no category at all", () => {
    expect(resolveProductCategory(null)).toEqual({ category: null, sizeChart: null });
  });
});

describe("intro and notes", () => {
  const withExtras = (): SizeChart => ({
    ...clone(SETS_CHART),
    intro: "  Compare these with a piece you own.  ",
    notes: [
      { label: " Fit type ", value: " Relaxed " },
      { label: "Model height", value: `5'6" · Wearing XS` },
    ],
  });

  it("accepts and trims them", () => {
    const out = validateSizeChart(withExtras());
    expect(out.intro).toBe("Compare these with a piece you own.");
    expect(out.notes).toEqual([
      { label: "Fit type", value: "Relaxed" },
      { label: "Model height", value: `5'6" · Wearing XS` },
    ]);
  });

  it("leaves them out when empty, so older stored charts round-trip unchanged", () => {
    const chart = { ...clone(SETS_CHART), intro: "  ", notes: [] };
    const out = validateSizeChart(chart);
    expect("intro" in out).toBe(false);
    expect("notes" in out).toBe(false);
    expect(out).toEqual(SETS_CHART);
  });

  it("rejects a half-filled note, too many notes, and over-long text", () => {
    const half = withExtras();
    half.notes = [{ label: "Fit type", value: " " }];
    expect(() => validateSizeChart(half)).toThrow(/note 1 needs both a label and text/);

    const many = withExtras();
    many.notes = Array.from({ length: SIZE_CHART_LIMITS.notes + 1 }, () => ({ label: "a", value: "b" }));
    expect(() => validateSizeChart(many)).toThrow(/at most 4 notes/);

    const intro = withExtras();
    intro.intro = "x".repeat(SIZE_CHART_LIMITS.introLength + 1);
    expect(() => validateSizeChart(intro)).toThrow(/intro/);

    const label = withExtras();
    label.notes = [{ label: "x".repeat(SIZE_CHART_LIMITS.noteLabelLength + 1), value: "v" }];
    expect(() => validateSizeChart(label)).toThrow(/label/);

    const value = withExtras();
    value.notes = [{ label: "l", value: "x".repeat(SIZE_CHART_LIMITS.noteValueLength + 1) }];
    expect(() => validateSizeChart(value)).toThrow(/text/);
  });

  it("rejects notes that aren't a list", () => {
    const chart = { ...clone(SETS_CHART), notes: "nope" };
    expect(() => validateSizeChart(chart)).toThrow(/notes are invalid/);
  });
});

describe("DEFAULT_SIZE_CHART (the standard chart)", () => {
  it("is itself a valid chart, unchanged by validation", () => {
    expect(validateSizeChart(DEFAULT_SIZE_CHART)).toEqual(DEFAULT_SIZE_CHART);
  });

  it("carries exactly the numbers and wording the old fixed Size guide showed", () => {
    const [section] = DEFAULT_SIZE_CHART.sections;
    expect(DEFAULT_SIZE_CHART.sizes).toEqual(["XS", "S", "M", "L", "XL", "XXL"]);
    // The previous hardcoded table, size by size: bust / waist / hip.
    const old = {
      XS: [32, 26, 36],
      S: [34, 28, 38],
      M: [36, 30, 40],
      L: [38, 32, 42],
      XL: [40, 34, 44],
      XXL: [42, 36, 46],
    } as const;
    const byLabel = Object.fromEntries(section.rows.map((r) => [r.label, r.values]));
    DEFAULT_SIZE_CHART.sizes.forEach((size, i) => {
      const [bust, waist, hip] = old[size as keyof typeof old];
      expect([byLabel.Bust[i], byLabel.Waist[i], byLabel.Hip[i]]).toEqual([
        String(bust),
        String(waist),
        String(hip),
      ]);
    });
    expect(DEFAULT_SIZE_CHART.caption).toBe("measurements in inches");
    expect(DEFAULT_SIZE_CHART.intro).toBe(
      "We've laid out body measurements so you can pick the size that feels closest to yours.",
    );
    expect(DEFAULT_SIZE_CHART.notes).toEqual([
      { label: "Fit type", value: "Comfortable fit" },
      { label: "Model height", value: `5'6" · Wearing XS` },
    ]);
  });

  it("standardSizeChart() returns an independent copy", () => {
    const copy = standardSizeChart();
    expect(copy).toEqual(DEFAULT_SIZE_CHART);
    copy.sections[0].rows[0].values[0] = "99";
    copy.notes![0].value = "changed";
    expect(DEFAULT_SIZE_CHART.sections[0].rows[0].values[0]).toBe("32");
    expect(DEFAULT_SIZE_CHART.notes![0].value).toBe("Comfortable fit");
  });
});

describe("chartSignature", () => {
  it("is the same whatever order the keys were built in", () => {
    const a: SizeChart = { caption: "c", intro: "i", sizes: ["S"], sections: SETS_CHART.sections.slice(0, 1).map((s) => ({ ...s, rows: [{ label: "Bust", values: ["1"] }] })) };
    const b = { sections: a.sections, sizes: a.sizes, intro: a.intro, caption: a.caption } as SizeChart;
    expect(chartSignature(a)).toBe(chartSignature(b));
  });

  it("treats absent and empty intro/notes alike, and differs when content differs", () => {
    const base = clone(SETS_CHART);
    expect(chartSignature(base)).toBe(chartSignature({ ...base, intro: "", notes: [] }));
    const changed = clone(SETS_CHART);
    changed.sections[0].rows[0].values[0] = "99";
    expect(chartSignature(changed)).not.toBe(chartSignature(base));
    expect(chartSignature(null)).toBe("null");
    expect(chartSignature(null)).not.toBe(chartSignature(base));
  });
});
