import { describe, expect, it } from "vitest";
import { safeJsonLd } from "./schemas";

describe("safeJsonLd", () => {
  it("escapes a </script> breakout attempt so the tag can't be closed early", () => {
    const malicious = { description: '</script><script>alert(1)</script>' };
    const serialized = safeJsonLd(malicious);
    expect(serialized).not.toContain("</script>");
    expect(serialized).not.toContain("<script>");
  });

  it("round-trips back to the exact original data once parsed — escaping never corrupts real JSON", () => {
    const data = {
      name: 'A "quoted" dress — </script><script>evil()</script>',
      price: 1299.5,
      nested: { tags: ["a<b", "c&d", "e>f"] },
    };
    const serialized = safeJsonLd(data);
    expect(JSON.parse(serialized)).toEqual(data);
  });

  it("escapes & and > as defense in depth, not just <", () => {
    const serialized = safeJsonLd({ x: "a<b>c&d" });
    expect(serialized).not.toContain("<");
    expect(serialized).not.toContain(">");
    expect(serialized).not.toContain("&");
  });

  it("escapes U+2028/U+2029, which are valid in a JSON string but illegal in raw JS source", () => {
    const LS = "\u2028";
    const PS = "\u2029";
    const serialized = safeJsonLd({ x: `line1${LS}line2${PS}line3` });
    expect(serialized).not.toContain(LS);
    expect(serialized).not.toContain(PS);
    expect(JSON.parse(serialized).x).toBe(`line1${LS}line2${PS}line3`);
  });

  it("leaves ordinary text completely unchanged in effect", () => {
    const data = { title: "Breezy Burgundy Dress", price: "1,299.00" };
    expect(JSON.parse(safeJsonLd(data))).toEqual(data);
  });
});
