import { describe, expect, it } from "vitest";
import { computeIsDefaultForNewAddress } from "./address-default";

describe("computeIsDefaultForNewAddress", () => {
  it("forces the first address to be default even when the caller explicitly passes false", () => {
    // This is the exact regression: the storefront form always sends
    // `isDefault: false` for a new address, never `undefined`.
    expect(computeIsDefaultForNewAddress(0, false)).toBe(true);
  });

  it("defaults the first address to true when the caller omits the flag", () => {
    expect(computeIsDefaultForNewAddress(0, undefined)).toBe(true);
  });

  it("keeps the first address default true when the caller explicitly passes true", () => {
    expect(computeIsDefaultForNewAddress(0, true)).toBe(true);
  });

  it("does not default a subsequent address unless explicitly requested", () => {
    expect(computeIsDefaultForNewAddress(1, false)).toBe(false);
    expect(computeIsDefaultForNewAddress(1, undefined)).toBe(false);
  });

  it("honors an explicit true for a subsequent address", () => {
    expect(computeIsDefaultForNewAddress(2, true)).toBe(true);
  });
});
