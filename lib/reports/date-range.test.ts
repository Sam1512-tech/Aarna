import { describe, expect, it } from "vitest";
import {
  MAX_REPORT_RANGE_MS,
  assertReportRangeWithinCap,
  resolveReportDateRange,
} from "./date-range";

describe("assertReportRangeWithinCap", () => {
  it("allows a range exactly at the cap", () => {
    const from = new Date("2024-01-01T00:00:00.000Z");
    const to = new Date(from.getTime() + MAX_REPORT_RANGE_MS);
    expect(() => assertReportRangeWithinCap(from, to)).not.toThrow();
  });

  it("rejects a range one millisecond over the cap", () => {
    const from = new Date("2024-01-01T00:00:00.000Z");
    const to = new Date(from.getTime() + MAX_REPORT_RANGE_MS + 1);
    expect(() => assertReportRangeWithinCap(from, to)).toThrow(
      /narrow it to 2 years or less/,
    );
  });

  it("allows a typical financial-year-sized range", () => {
    const from = new Date("2025-04-01T00:00:00.000Z");
    const to = new Date("2026-04-01T00:00:00.000Z");
    expect(() => assertReportRangeWithinCap(from, to)).not.toThrow();
  });

  it("allows a same-day range", () => {
    const from = new Date("2026-07-23T00:00:00.000Z");
    const to = new Date("2026-07-24T00:00:00.000Z");
    expect(() => assertReportRangeWithinCap(from, to)).not.toThrow();
  });

  it("every preset resolveReportDateRange offers stays comfortably within the cap", () => {
    const now = new Date("2026-07-23T12:00:00.000Z");
    for (const preset of [
      "this_month",
      "last_month",
      "this_quarter",
      "this_financial_year",
    ] as const) {
      const range = resolveReportDateRange(preset, undefined, undefined, now);
      expect(() => assertReportRangeWithinCap(range.from, range.to)).not.toThrow();
    }
  });
});
