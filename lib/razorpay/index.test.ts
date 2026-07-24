import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { verifyPaymentSignature } from "./index";

const ORIGINAL_SECRET = process.env.RAZORPAY_KEY_SECRET;

describe("verifyPaymentSignature", () => {
  beforeEach(() => {
    process.env.RAZORPAY_KEY_SECRET = "test_secret_key";
  });

  afterEach(() => {
    process.env.RAZORPAY_KEY_SECRET = ORIGINAL_SECRET;
  });

  it("returns false, not a thrown error, for a wrong-length signature", () => {
    // Before the fix, crypto.timingSafeEqual threw a RangeError here instead
    // of returning false — this is the exact crash this test guards against.
    expect(() =>
      verifyPaymentSignature({
        razorpayOrderId: "order_abc",
        razorpayPaymentId: "pay_xyz",
        razorpaySignature: "too-short",
      }),
    ).not.toThrow();
    expect(
      verifyPaymentSignature({
        razorpayOrderId: "order_abc",
        razorpayPaymentId: "pay_xyz",
        razorpaySignature: "too-short",
      }),
    ).toBe(false);
  });

  it("returns false for a correct-length but wrong-value signature", () => {
    const wrongButRightLength = "0".repeat(64);
    expect(
      verifyPaymentSignature({
        razorpayOrderId: "order_abc",
        razorpayPaymentId: "pay_xyz",
        razorpaySignature: wrongButRightLength,
      }),
    ).toBe(false);
  });

  it("returns true for a genuinely correct signature", () => {
    const expected = crypto
      .createHmac("sha256", "test_secret_key")
      .update("order_abc|pay_xyz")
      .digest("hex");
    expect(
      verifyPaymentSignature({
        razorpayOrderId: "order_abc",
        razorpayPaymentId: "pay_xyz",
        razorpaySignature: expected,
      }),
    ).toBe(true);
  });

  it("throws a clear error if RAZORPAY_KEY_SECRET is unset (fail closed on misconfiguration)", () => {
    delete process.env.RAZORPAY_KEY_SECRET;
    expect(() =>
      verifyPaymentSignature({
        razorpayOrderId: "order_abc",
        razorpayPaymentId: "pay_xyz",
        razorpaySignature: "anything",
      }),
    ).toThrow("RAZORPAY_KEY_SECRET not set.");
  });
});
