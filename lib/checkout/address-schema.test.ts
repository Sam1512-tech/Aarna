import { describe, expect, it } from "vitest";
import { shippingAddressSchema } from "./address-schema";

const VALID_ADDRESS = {
  fullName: "Arpitha Abhishek",
  phone: "9876543210",
  line1: "No. 3571, 1st H Cross",
  line2: "Giri Nagar",
  city: "Bengaluru",
  state: "Karnataka",
  pincode: "560085",
};

describe("shippingAddressSchema", () => {
  it("accepts a well-formed address", () => {
    expect(shippingAddressSchema.safeParse(VALID_ADDRESS).success).toBe(true);
  });

  it("accepts a well-formed address with no line2 (optional)", () => {
    const { line2, ...rest } = VALID_ADDRESS;
    expect(shippingAddressSchema.safeParse(rest).success).toBe(true);
  });

  it("rejects a missing state — this is the exact field that crashed invoice generation", () => {
    const { state, ...rest } = VALID_ADDRESS;
    const result = shippingAddressSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects an empty-string state", () => {
    const result = shippingAddressSchema.safeParse({ ...VALID_ADDRESS, state: "" });
    expect(result.success).toBe(false);
  });

  it("rejects a whitespace-only state (trimmed to empty)", () => {
    const result = shippingAddressSchema.safeParse({ ...VALID_ADDRESS, state: "   " });
    expect(result.success).toBe(false);
  });

  it("rejects a pincode that isn't exactly 6 digits", () => {
    expect(shippingAddressSchema.safeParse({ ...VALID_ADDRESS, pincode: "1234" }).success).toBe(false);
    expect(shippingAddressSchema.safeParse({ ...VALID_ADDRESS, pincode: "abcdef" }).success).toBe(false);
  });

  it("rejects a missing line1", () => {
    const { line1, ...rest } = VALID_ADDRESS;
    expect(shippingAddressSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects a missing fullName or city", () => {
    const { fullName, ...withoutName } = VALID_ADDRESS;
    expect(shippingAddressSchema.safeParse(withoutName).success).toBe(false);
    const { city, ...withoutCity } = VALID_ADDRESS;
    expect(shippingAddressSchema.safeParse(withoutCity).success).toBe(false);
  });

  it("is deliberately looser than the client schema — doesn't enforce letters-only or a strict mobile pattern", () => {
    // The client (components/storefront/checkout-view.tsx) rejects these;
    // this schema's only job is guaranteeing non-empty fields reach
    // buildInvoiceData, not re-policing typos the client already caught.
    expect(shippingAddressSchema.safeParse({ ...VALID_ADDRESS, fullName: "X" }).success).toBe(true);
    expect(shippingAddressSchema.safeParse({ ...VALID_ADDRESS, phone: "123" }).success).toBe(true);
  });
});
