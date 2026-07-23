import { describe, expect, it } from "vitest";
import { neutralizeFormulaCell } from "./sanitize";

describe("neutralizeFormulaCell", () => {
  it("prefixes a string starting with = (the classic formula trigger)", () => {
    expect(neutralizeFormulaCell('=HYPERLINK("http://evil.example")')).toBe(
      '\'=HYPERLINK("http://evil.example")',
    );
  });

  it("prefixes a string starting with +, -, or @", () => {
    expect(neutralizeFormulaCell("+1+1")).toBe("'+1+1");
    expect(neutralizeFormulaCell("-2+3")).toBe("'-2+3");
    expect(neutralizeFormulaCell("@SUM(A1:A2)")).toBe("'@SUM(A1:A2)");
  });

  it("prefixes a string starting with a tab or carriage return", () => {
    expect(neutralizeFormulaCell("\t=cmd")).toBe("'\t=cmd");
    expect(neutralizeFormulaCell("\r=cmd")).toBe("'\r=cmd");
  });

  it("leaves an ordinary string alone", () => {
    expect(neutralizeFormulaCell("Arpitha Abhishek")).toBe("Arpitha Abhishek");
    expect(neutralizeFormulaCell("AARNA-001017")).toBe("AARNA-001017");
  });

  it("leaves a hyphenated but otherwise ordinary string's un-triggered characters alone (only the leading char matters)", () => {
    // A dash isn't dangerous mid-string, only as the very first character.
    expect(neutralizeFormulaCell("Bengaluru - Karnataka")).toBe("Bengaluru - Karnataka");
  });

  it("never touches a genuine number, even a negative one", () => {
    // A real numeric cell can't be interpreted as a formula regardless of
    // its value — only a *string* that merely looks like one is dangerous.
    expect(neutralizeFormulaCell(-500)).toBe(-500);
    expect(neutralizeFormulaCell(1250000)).toBe(1250000);
  });

  it("leaves an empty string alone", () => {
    expect(neutralizeFormulaCell("")).toBe("");
  });
});
