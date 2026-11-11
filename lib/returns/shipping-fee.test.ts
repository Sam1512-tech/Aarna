import { describe, expect, it } from "vitest";
import {
  RETURN_SHIPPING_FEE_PAISE,
  orderRefundStatus,
  refundAfterReturnShippingFee,
} from "./shipping-fee";

describe("RETURN_SHIPPING_FEE_PAISE", () => {
  it("is ₹99", () => {
    expect(RETURN_SHIPPING_FEE_PAISE).toBe(9900);
  });
});

describe("refundAfterReturnShippingFee", () => {
  it("takes ₹99 off the item price", () => {
    expect(refundAfterReturnShippingFee(249900)).toBe(240000);
  });

  it("keeps paise precision", () => {
    expect(refundAfterReturnShippingFee(249950)).toBe(240050);
  });

  it("refunds nothing, never a negative amount, when the item costs the fee or less", () => {
    expect(refundAfterReturnShippingFee(9900)).toBe(0);
    expect(refundAfterReturnShippingFee(5000)).toBe(0);
    expect(refundAfterReturnShippingFee(0)).toBe(0);
  });
});

describe("orderRefundStatus", () => {
  it("is refunded once refunds plus the kept-back fees reach the item total", () => {
    // One ₹2,499 item returned: refunded ₹2,400, ₹99 kept back.
    expect(
      orderRefundStatus({
        cumulativeRefunded: 240000,
        retainedReturnFees: 9900,
        refundableTotal: 249900,
      }),
    ).toBe("refunded");
  });

  it("would have been stuck at partially_refunded without counting the fee", () => {
    expect(
      orderRefundStatus({
        cumulativeRefunded: 240000,
        retainedReturnFees: 0,
        refundableTotal: 249900,
      }),
    ).toBe("partially_refunded");
  });

  it("stays partially_refunded while an item is still unreturned", () => {
    // Two ₹2,499 items, one returned.
    expect(
      orderRefundStatus({
        cumulativeRefunded: 240000,
        retainedReturnFees: 9900,
        refundableTotal: 499800,
      }),
    ).toBe("partially_refunded");
  });

  it("is refunded when every item of a multi-item order is returned", () => {
    expect(
      orderRefundStatus({
        cumulativeRefunded: 480000,
        retainedReturnFees: 19800,
        refundableTotal: 499800,
      }),
    ).toBe("refunded");
  });

  it("is refunded for a legacy full-amount return (no fee)", () => {
    expect(
      orderRefundStatus({
        cumulativeRefunded: 249900,
        retainedReturnFees: 0,
        refundableTotal: 249900,
      }),
    ).toBe("refunded");
  });
});
