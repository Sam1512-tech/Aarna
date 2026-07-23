import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "./safe-redirect";

describe("safeRedirectPath", () => {
  it("allows a plain same-origin relative path", () => {
    expect(safeRedirectPath("/account/orders", "/account")).toBe("/account/orders");
  });

  it("falls back for null/undefined/empty input", () => {
    expect(safeRedirectPath(null, "/account")).toBe("/account");
    expect(safeRedirectPath(undefined, "/account")).toBe("/account");
    expect(safeRedirectPath("", "/account")).toBe("/account");
  });

  it("falls back for a path that doesn't start with a slash", () => {
    expect(safeRedirectPath("account", "/account")).toBe("/account");
    expect(safeRedirectPath("evil.com", "/account")).toBe("/account");
  });

  it("rejects a protocol-relative redirect (//host)", () => {
    expect(safeRedirectPath("//evil.com", "/account")).toBe("/account");
  });

  it("rejects the backslash bypass — the real bug this helper was extracted to fix", () => {
    // A leading "/\" passes a naive startsWith("/") + !startsWith("//")
    // check, but the WHATWG URL parser normalizes "\" to "/" for http(s)
    // schemes, so `new URL("/\\evil.com", origin)` resolves off-origin.
    expect(safeRedirectPath("/\\evil.com", "/account")).toBe("/account");
  });

  it("rejects a backslash anywhere in the path, not just at the start", () => {
    expect(safeRedirectPath("/account/\\evil.com", "/account")).toBe("/account");
  });

  it("allows a deep, legitimate internal path", () => {
    expect(safeRedirectPath("/account/exchanges", "/account")).toBe("/account/exchanges");
  });
});
