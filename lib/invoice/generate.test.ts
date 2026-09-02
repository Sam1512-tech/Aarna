import { describe, expect, it } from "vitest";
import {
  calculateOrderGst,
  invoiceSequenceName,
  isInterStateOrder,
  type GstLineInput,
} from "./generate";

describe("invoiceSequenceName", () => {
  it("derives a per-financial-year sequence name", () => {
    expect(invoiceSequenceName("26-27")).toBe("invoice_seq_26_27");
  });

  it("varies by financial year — the real bug this exists to fix", () => {
    // A single global sequence never resets at the April FY boundary; a
    // per-FY sequence name is what makes it actually start over at 00001.
    expect(invoiceSequenceName("26-27")).not.toBe(invoiceSequenceName("27-28"));
    expect(invoiceSequenceName("27-28")).toBe("invoice_seq_27_28");
  });

  it("rejects an unexpected financial-year shape rather than passing it into raw SQL unescaped", () => {
    expect(() => invoiceSequenceName("2026-2027")).toThrow();
    expect(() => invoiceSequenceName("26-27; DROP TABLE orders;--")).toThrow();
    expect(() => invoiceSequenceName("")).toThrow();
  });
});

describe("isInterStateOrder", () => {
  it("treats Karnataka as intra-state", () => {
    expect(isInterStateOrder("Karnataka")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(isInterStateOrder("karnataka")).toBe(false);
    expect(isInterStateOrder("KARNATAKA")).toBe(false);
    expect(isInterStateOrder("KaRnAtAkA")).toBe(false);
  });

  it("trims surrounding whitespace", () => {
    expect(isInterStateOrder("  Karnataka  ")).toBe(false);
  });

  it("strips diacritics — the real bug this function was fixed for", () => {
    // A real order was found with the state stored as "Karnātaka" (an
    // address-autofill artifact), which a plain lowercase compare silently
    // treated as inter-state, charging IGST instead of CGST+SGST.
    expect(isInterStateOrder("Karnātaka")).toBe(false);
  });

  it("treats any other state as inter-state", () => {
    expect(isInterStateOrder("Delhi")).toBe(true);
    expect(isInterStateOrder("Tamil Nadu")).toBe(true);
    expect(isInterStateOrder("Maharashtra")).toBe(true);
  });

  it("recognizes the standard KA state code — 8 real orders were misclassified before this", () => {
    // Not a typo — "KA" is the standard ISO 3166-2:IN abbreviation for
    // Karnataka, and a completely normal thing for a customer to type or an
    // address-autofill to fill in. A direct check of production data found
    // 8 real orders charged IGST instead of CGST+SGST because of this.
    expect(isInterStateOrder("KA")).toBe(false);
    expect(isInterStateOrder("ka")).toBe(false);
    expect(isInterStateOrder(" Ka ")).toBe(false);
  });

  it("recognizes real typos seen in production (Karnatka, Karanataka)", () => {
    expect(isInterStateOrder("Karnatka")).toBe(false);
    expect(isInterStateOrder("Karanataka")).toBe(false);
  });

  it("does not fuzzy-match — a short code for a different state must still be inter-state", () => {
    // Guards the fixed-allowlist design choice: this must never become a
    // lenient/fuzzy check that could accidentally treat a different state's
    // own abbreviation or a longer name as Karnataka.
    expect(isInterStateOrder("KL")).toBe(true); // Kerala
    expect(isInterStateOrder("MH")).toBe(true); // Maharashtra
    expect(isInterStateOrder("Karnataka Adjacent")).toBe(true);
  });
});

describe("calculateOrderGst", () => {
  function line(unitPrice: number, quantity = 1): GstLineInput {
    return { unitPrice, quantity, lineTotal: unitPrice * quantity };
  }

  it("applies 5% and splits into CGST+SGST (each ~half the total tax) for an intra-state order at/under the threshold", () => {
    const result = calculateOrderGst([line(250000)], 0, false); // Rs.2500, no discount
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].gstRatePercent).toBe(5);
    // GST-inclusive Rs.2500 at 5% -> taxable = 2500 / 1.05 = 2380.95... -> rounds to 238095 paise
    expect(result.lines[0].taxableAmount).toBe(238095);
    expect(result.lines[0].igst).toBe(0);
    expect(result.lines[0].cgst).toBeGreaterThan(0);
    // cgst and sgst aren't required to be exactly equal — only their sum is
    // guaranteed to equal the line's total tax (see the next test) — here
    // the total tax (11905) is odd, so the halves land one paise apart.
    expect(Math.abs(result.lines[0].cgst - result.lines[0].sgst)).toBeLessThanOrEqual(1);
    expect(result.rateBreakdown).toEqual([
      {
        ratePercent: 5,
        taxableAmount: result.lines[0].taxableAmount,
        cgst: result.lines[0].cgst,
        sgst: result.lines[0].sgst,
        igst: 0,
      },
    ]);
  });

  it("applies 18% for a piece one paise over the threshold", () => {
    const result = calculateOrderGst([line(250001)], 0, false);
    expect(result.lines[0].gstRatePercent).toBe(18);
  });

  it("evaluates the rate on unit price, not line total — quantity never bumps the slab", () => {
    // 3 x Rs.2000 pieces: each unit is under the threshold, so all stay 5%
    // even though the line total (Rs.6000) is well past Rs.2500.
    const result = calculateOrderGst([line(200000, 3)], 0, false);
    expect(result.lines[0].gstRatePercent).toBe(5);
  });

  it("charges IGST only for an inter-state order, with no CGST/SGST", () => {
    const result = calculateOrderGst([line(300000)], 0, true); // Rs.3000, 18%
    expect(result.lines[0].cgst).toBe(0);
    expect(result.lines[0].sgst).toBe(0);
    expect(result.lines[0].igst).toBeGreaterThan(0);
    expect(result.igst).toBe(result.lines[0].igst);
    expect(result.cgst).toBe(0);
    expect(result.sgst).toBe(0);
  });

  it("keeps CGST + SGST exactly equal to the line's total tax even when the tax is odd (no independent-rounding drift)", () => {
    // Rs.333.33 (33333 paise) at 5% GST-inclusive produces an odd total tax
    // paise value — the classic case where two independently-rounded halves
    // could fail to sum back to the whole.
    const result = calculateOrderGst([line(33333)], 0, false);
    const line0 = result.lines[0];
    const totalTax = line0.discountedLineTotal - line0.taxableAmount;
    expect(line0.cgst + line0.sgst).toBe(totalTax);
  });

  it("allocates a discount proportionally across lines and puts any rounding remainder on the last line", () => {
    // Two lines: Rs.1000 and Rs.2000 (subtotal Rs.3000), Rs.100 discount.
    // Line 1 share: round(1000/3000 * 100) = round(33.33) = 33
    // Line 2 (last): 100 - 33 = 67
    const result = calculateOrderGst(
      [line(100000), line(200000)],
      10000,
      false,
    );
    const discountedSum = result.lines.reduce((s, l) => s + l.discountedLineTotal, 0);
    expect(discountedSum).toBe(100000 + 200000 - 10000);
    expect(result.lines[0].discountedLineTotal).toBe(100000 - 3333);
    expect(result.lines[1].discountedLineTotal).toBe(200000 - 6667);
  });

  it("never lets a discount push a line's total below zero", () => {
    const result = calculateOrderGst([line(50000)], 999999, false);
    expect(result.lines[0].discountedLineTotal).toBe(0);
    expect(result.lines[0].taxableAmount).toBe(0);
    expect(result.lines[0].cgst).toBe(0);
    expect(result.lines[0].sgst).toBe(0);
  });

  it("keeps a zero discount as a full no-op — every line stays at its original total", () => {
    const result = calculateOrderGst([line(150000), line(400000)], 0, false);
    expect(result.lines[0].discountedLineTotal).toBe(150000);
    expect(result.lines[1].discountedLineTotal).toBe(400000);
  });

  it("itemizes 5% and 18% lines as two separate, ascending rateBreakdown buckets — never blended", () => {
    const result = calculateOrderGst(
      [line(200000), line(500000)], // Rs.2000 (5%) + Rs.5000 (18%)
      0,
      false,
    );
    expect(result.rateBreakdown).toHaveLength(2);
    expect(result.rateBreakdown[0].ratePercent).toBe(5);
    expect(result.rateBreakdown[1].ratePercent).toBe(18);
    // Order-level totals must equal the sum of both buckets.
    expect(result.taxableAmount).toBe(
      result.rateBreakdown[0].taxableAmount + result.rateBreakdown[1].taxableAmount,
    );
  });

  it("groups multiple lines at the same rate into one rateBreakdown bucket", () => {
    const result = calculateOrderGst([line(100000), line(150000)], 0, false); // both 5%
    expect(result.rateBreakdown).toHaveLength(1);
    expect(result.rateBreakdown[0].ratePercent).toBe(5);
    expect(result.rateBreakdown[0].taxableAmount).toBe(
      result.lines[0].taxableAmount + result.lines[1].taxableAmount,
    );
  });

  it("handles an empty item list without throwing", () => {
    const result = calculateOrderGst([], 0, false);
    expect(result.lines).toEqual([]);
    expect(result.rateBreakdown).toEqual([]);
    expect(result.taxableAmount).toBe(0);
  });
});
