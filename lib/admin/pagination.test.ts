import { describe, expect, it } from "vitest";
import { buildPaginationHref } from "./pagination";

describe("buildPaginationHref", () => {
  it("returns the bare basePath for page 1 with no filters", () => {
    expect(buildPaginationHref("/studio/orders", 1, {})).toBe("/studio/orders");
  });

  it("omits page from the URL for page 1 even with filters present", () => {
    expect(buildPaginationHref("/studio/orders", 1, { payment: "paid" })).toBe(
      "/studio/orders?payment=paid",
    );
  });

  it("includes page for any page beyond 1", () => {
    expect(buildPaginationHref("/studio/orders", 2, {})).toBe("/studio/orders?page=2");
  });

  it("preserves multiple active filters alongside page", () => {
    const href = buildPaginationHref("/studio/orders", 3, {
      payment: "paid",
      fulfillment: "shipped",
      search: "AARNA-001",
    });
    const url = new URL(href, "http://x");
    expect(url.pathname).toBe("/studio/orders");
    expect(url.searchParams.get("payment")).toBe("paid");
    expect(url.searchParams.get("fulfillment")).toBe("shipped");
    expect(url.searchParams.get("search")).toBe("AARNA-001");
    expect(url.searchParams.get("page")).toBe("3");
  });

  it("omits an undefined filter value entirely (no empty query param)", () => {
    expect(buildPaginationHref("/studio/reviews", 2, { status: undefined })).toBe(
      "/studio/reviews?page=2",
    );
  });

  it("omits an empty-string filter value the same way (checkbox-style params like active/expired)", () => {
    // coupons/inventory pass "1" or undefined for checkbox filters — an
    // empty string should never leak into the URL as `active=`.
    expect(
      buildPaginationHref("/studio/coupons", 2, { active: "", expired: "1" }),
    ).toBe("/studio/coupons?expired=1&page=2");
  });

  it("matches the returns page's status+type filter shape", () => {
    expect(
      buildPaginationHref("/studio/returns", 2, { status: "requested", type: "exchange" }),
    ).toBe("/studio/returns?status=requested&type=exchange&page=2");
  });
});
