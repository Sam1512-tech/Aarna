import { describe, expect, it } from "vitest";
import {
  GST_VALUE_THRESHOLD_PAISE,
  gstRatePercentFor,
  isValidGstin,
  normalizeGstin,
} from "./gst";

describe("gstRatePercentFor", () => {
  it("taxes a piece priced exactly at the Rs.2500 threshold at 5%", () => {
    expect(gstRatePercentFor(GST_VALUE_THRESHOLD_PAISE)).toBe(5);
  });

  it("taxes one paise under the threshold at 5%", () => {
    expect(gstRatePercentFor(GST_VALUE_THRESHOLD_PAISE - 1)).toBe(5);
  });

  it("taxes one paise over the threshold at 18%", () => {
    expect(gstRatePercentFor(GST_VALUE_THRESHOLD_PAISE + 1)).toBe(18);
  });

  it("taxes a cheap item at 5%", () => {
    expect(gstRatePercentFor(50000)).toBe(5); // Rs.500
  });

  it("taxes an expensive item at 18%", () => {
    expect(gstRatePercentFor(999900)).toBe(18); // Rs.9999
  });
});

describe("normalizeGstin", () => {
  it("trims and uppercases", () => {
    expect(normalizeGstin("  29acnfa3302j1zd  ")).toBe("29ACNFA3302J1ZD");
  });

  it("returns null for blank, null, or undefined input", () => {
    expect(normalizeGstin("")).toBeNull();
    expect(normalizeGstin("   ")).toBeNull();
    expect(normalizeGstin(null)).toBeNull();
    expect(normalizeGstin(undefined)).toBeNull();
  });
});

describe("isValidGstin", () => {
  it("accepts Aarna's own real, valid GSTIN", () => {
    expect(isValidGstin("29ACNFA3302J1ZD")).toBe(true);
  });

  it("rejects a string that's too short", () => {
    expect(isValidGstin("29ACNFA3302J1Z")).toBe(false);
  });

  it("rejects a string that's too long", () => {
    expect(isValidGstin("29ACNFA3302J1ZDD")).toBe(false);
  });

  it("rejects lowercase (normalizeGstin should run first in real callers)", () => {
    expect(isValidGstin("29acnfa3302j1zd")).toBe(false);
  });

  it("rejects a missing literal Z at position 14", () => {
    expect(isValidGstin("29ACNFA3302J1AD")).toBe(false);
  });

  it("rejects a state-code prefix that isn't 2 digits", () => {
    expect(isValidGstin("XXACNFA3302J1ZD")).toBe(false);
  });
});
