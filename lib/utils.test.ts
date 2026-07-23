import { describe, expect, it } from "vitest";
import { slugify } from "./utils";

describe("slugify", () => {
  it("collapses an underscore into a dash and lowercases", () => {
    // The exact case that exposed the divergence between the two former
    // implementations: lib/utils.ts's old regex only stripped non-word
    // characters and never treated "_" as a separator, so "Boho_Dress"
    // slugified to "bohodress" instead of "boho-dress".
    expect(slugify("Boho_Dress")).toBe("boho-dress");
  });

  it("collapses runs of whitespace/punctuation into a single dash", () => {
    expect(slugify("Floral   Maxi Dress!!")).toBe("floral-maxi-dress");
  });

  it("strips quotes rather than turning them into a dash", () => {
    expect(slugify(`Women's "Boho" Top`)).toBe("womens-boho-top");
  });

  it("trims leading/trailing dashes", () => {
    expect(slugify("  --Summer Sale--  ")).toBe("summer-sale");
  });

  it("truncates to 60 characters", () => {
    const long = "a".repeat(100);
    expect(slugify(long)).toHaveLength(60);
  });
});
