/**
 * Return-shipping fee held back from a plain return's refund. Single source of
 * truth: the return policy page, the customer's refund preview, the refund
 * amount stored when a return is requested, and the "is this order fully
 * refunded yet?" check all read it from here.
 *
 * Not a "use server" module on purpose — constants and sync helpers can't be
 * exported from one (same reason reject-reasons.ts sits beside this file).
 */

/** ₹99, in paise. Change here and every place above follows. */
export const RETURN_SHIPPING_FEE_PAISE = 9900;

/**
 * What a customer gets back for a returned item, given what they paid for it.
 * Floors at 0: an item cheaper than the fee refunds nothing rather than going
 * negative (a negative refund would reach Razorpay's API as an invalid amount).
 *
 * Applied once, when the return is requested, and stored as returns.refundAmount
 * — every later step (the admin's QC pass, the COD and external-refund
 * reconciliations, the credit note) already refunds "the stored refundAmount,
 * else the item's line total", so they all pick the net amount up unchanged.
 * Returns requested before this existed keep their stored full amount.
 */
export function refundAfterReturnShippingFee(lineTotalPaise: number): number {
  return Math.max(0, lineTotalPaise - RETURN_SHIPPING_FEE_PAISE);
}

/**
 * How much return-shipping fee a stored return actually has taken off — what
 * every screen and email that itemises the deduction shows. Derived from the
 * stored amounts rather than kept in its own column: the refund stored at
 * request time is the item price minus the fee, so the fee is the gap.
 *
 * 0 for anything that isn't a fee: an exchange, a request raised before the
 * fee existed (stored at the full price), or a QC fail, whose refundAmount is
 * whatever the admin chose to give back, not the fee. sumRetainedReturnFees
 * (lib/db/queries/orders.ts) is this same rule as SQL, narrowed to returns
 * that are already refunded — keep the two in step.
 */
export function returnShippingFeeKept(r: {
  type: "return" | "exchange";
  qcOutcome: "pass" | "fail" | null;
  refundAmount: number | null;
  lineTotal: number;
}): number {
  if (r.type !== "return" || r.qcOutcome === "fail" || r.refundAmount === null) {
    return 0;
  }
  return Math.max(0, r.lineTotal - r.refundAmount);
}

/**
 * Whether an order counts as fully refunded. Compares what has actually been
 * refunded PLUS the return-shipping fees deliberately kept back against the sum
 * of the order's item totals.
 *
 * Without the fees term, every order whose items were all returned would stay
 * "partially_refunded" for good — each refund is the item price minus the fee,
 * so the refunded total can never reach the item total. That is the same
 * "stuck at partially_refunded even once every item is refunded" bug
 * recordRefund's own comment describes for shipping.
 */
export function orderRefundStatus(input: {
  cumulativeRefunded: number;
  retainedReturnFees: number;
  refundableTotal: number;
}): "refunded" | "partially_refunded" {
  return input.cumulativeRefunded + input.retainedReturnFees >= input.refundableTotal
    ? "refunded"
    : "partially_refunded";
}
