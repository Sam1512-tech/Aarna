"use server";

import type { AddressInput, CheckoutSummary } from "@/lib/types";

export interface CheckoutInitInput {
  shippingAddress: AddressInput;
  billingSameAsShipping: boolean;
  billingAddress?: AddressInput;
  couponCode?: string;
  whatsappOptIn: boolean;
}

export interface RazorpayOrderHandle {
  razorpayOrderId: string;
  razorpayKeyId: string;
  amount: number;
  currency: "INR";
  orderNumber: string;
}

export async function initCheckout(
  _input: CheckoutInitInput,
): Promise<{ summary: CheckoutSummary; razorpay: RazorpayOrderHandle }> {
  // TODO(backend): validate cart, create internal order in 'pending' state,
  // create razorpay order, return handle for client modal.
  throw new Error("Not implemented");
}

export async function checkPincodeServiceability(
  _pincode: string,
): Promise<{ serviceable: boolean; etaDays?: number }> {
  // TODO(backend): call Shiprocket courier serviceability API.
  return { serviceable: false };
}
