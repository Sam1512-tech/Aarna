import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { razorpayApiErrorDetail, verifyPaymentSignature } from "./index";

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

describe("razorpayApiErrorDetail", () => {
  it("extracts code + description from the Node SDK's real rejection shape", () => {
    // Exact shape node_modules/razorpay/dist/api.js's normalizeError throws
    // on an API-level rejection — a plain object, not an Error instance.
    const sdkError = {
      statusCode: 400,
      error: {
        code: "BAD_REQUEST_ERROR",
        description: "The refund amount exceeds the amount that could be refunded.",
      },
    };
    expect(razorpayApiErrorDetail(sdkError)).toEqual({
      code: "BAD_REQUEST_ERROR",
      description: "The refund amount exceeds the amount that could be refunded.",
    });
  });

  it("omits code when the SDK doesn't include one, but keeps the description", () => {
    expect(razorpayApiErrorDetail({ error: { description: "Something went wrong." } })).toEqual({
      code: undefined,
      description: "Something went wrong.",
    });
  });

  it("returns undefined for a real Error instance (network failure, unrelated bug)", () => {
    expect(razorpayApiErrorDetail(new Error("connect ECONNREFUSED"))).toBeUndefined();
  });

  it("returns undefined for null, primitives, and shapes missing a description", () => {
    expect(razorpayApiErrorDetail(null)).toBeUndefined();
    expect(razorpayApiErrorDetail(undefined)).toBeUndefined();
    expect(razorpayApiErrorDetail("plain string error")).toBeUndefined();
    expect(razorpayApiErrorDetail({ statusCode: 500 })).toBeUndefined();
    expect(razorpayApiErrorDetail({ error: { code: "X" } })).toBeUndefined();
    expect(razorpayApiErrorDetail({ error: "not an object" })).toBeUndefined();
  });
});
