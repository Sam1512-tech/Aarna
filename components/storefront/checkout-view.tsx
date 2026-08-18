"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Banknote, Check, Lock, MapPin, Plus, ShieldCheck, Truck } from "lucide-react";
import { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import {
  checkPincodeServiceability,
  initCheckout,
} from "@/lib/actions/checkout";
import { createAddress } from "@/lib/actions/account";
import { applyCoupon } from "@/lib/actions/cart";
import { clearStoredCoupon, getStoredCoupon } from "@/lib/cart/coupon-storage";
import { COD_CONVENIENCE_FEE_PAISE } from "@/lib/checkout/cod";
import type { AddressRow, CartState } from "@/lib/types";
import { formatINR } from "@/lib/utils";
import { actionErrorMessage } from "@/lib/action-error";

const FORM_DRAFT_KEY = "aarna-checkout-draft";

// Client-side format/typo validation (letters-only names, phone prefix,
// GSTIN pattern, etc.) was deliberately removed — this form now only checks
// that required fields have something in them, not whether it's correctly
// formatted. That's an intentional simplification, not an oversight: the
// server-side re-check this relies on for correctness lives in
// lib/checkout/address-schema.ts (shippingAddressSchema, run inside
// initCheckout) and independently for GSTIN inside initCheckout itself
// (normalizeGstin/isValidGstin) — both already existed before this change,
// both already throw a clear ActionError caught below in onSubmit's catch
// block and shown via submitError. Never remove those; they're what stands
// between a malformed address and the exact invoice-generation crash this
// project already got bitten by once (see the comment in
// lib/checkout/address-schema.ts).
const REQUIRED_FIELDS = [
  "fullName",
  "phone",
  "line1",
  "city",
  "state",
  "pincode",
] as const;

// ── India Post postal DB lookup ───────────────────────────────────────────────
// Free, public, no auth — and known to be flaky (timeouts/5xx/429, or blocked
// by an ad-blocker/network filter on the customer's side). We only hard-block
// when the API actually confirms the pincode doesn't exist ("not_found"); any
// lookup failure ("unknown" — timeout, non-2xx, bad JSON, network error) falls
// through optimistically instead of rejecting a possibly-valid pincode, same
// as checkPincodeServiceability already does for its own failures.
interface PostalRecord {
  district: string;
  state: string;
}
type PostalLookup =
  | { status: "found"; record: PostalRecord }
  | { status: "not_found" }
  | { status: "unknown" };
async function fetchIndiaPostal(pincode: string): Promise<PostalLookup> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(
      `https://api.postalpincode.in/pincode/${pincode}`,
      { signal: controller.signal },
    );
    clearTimeout(timeoutId);
    if (!res.ok) return { status: "unknown" };
    const data = await res.json();
    const record = Array.isArray(data) ? data[0] : null;
    if (!record) return { status: "unknown" };
    if (record.Status !== "Success") return { status: "not_found" };
    const po = record.PostOffice?.[0];
    if (!po?.District || !po?.State) return { status: "not_found" };
    return {
      status: "found",
      record: { district: String(po.District), state: String(po.State) },
    };
  } catch {
    return { status: "unknown" };
  }
}

interface ShippingForm {
  fullName: string;
  phone: string;
  email: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  pincode: string;
  whatsappOptIn: boolean;
  saveAddress: boolean;
  gstNumber: string;
}

// Minimal Razorpay checkout option shape — keeps us off @types/razorpay.
interface RazorpayHandlerArgs {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}
interface RazorpayOptions {
  key: string;
  order_id: string;
  amount: number;
  currency: string;
  name: string;
  description?: string;
  prefill?: { name?: string; email?: string; contact?: string };
  notes?: Record<string, string>;
  theme?: { color?: string };
  handler?: (args: RazorpayHandlerArgs) => void;
  modal?: { ondismiss?: () => void };
}
interface RazorpayInstance {
  open(): void;
}
declare global {
  interface Window {
    Razorpay?: new (opts: RazorpayOptions) => RazorpayInstance;
  }
}

interface CheckoutViewProps {
  cart: CartState;
  prefill: { email: string; phone: string; fullName: string };
  /** Saved addresses from the account address book — empty if the customer
   *  has none yet. Purely a convenience layer over the same manual form. */
  addresses: AddressRow[];
  /** Server-computed (lib/checkout/cod.ts's isCodEnabled(), read via a
   *  server component) — never read the underlying env var client-side. */
  codEnabled: boolean;
}

export function CheckoutView({ cart, prefill, addresses, codEnabled }: CheckoutViewProps) {
  const router = useRouter();
  // Pre-select the default saved address (or the first one if none is
  // marked default) so the form opens already filled in for a returning
  // customer. `addresses` is server-rendered, not client-fetched, so this
  // is safe to compute once up front rather than in an effect.
  const initialAddress =
    addresses.find((a) => a.isDefault) ?? addresses[0] ?? null;
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(
    initialAddress?.id ?? null,
  );
  const [pincodeStatus, setPincodeStatus] = useState<
    null | {
      serviceable: boolean;
      checking: boolean;
      verified: boolean;
      postalHint: string | null;
      etaDays?: string;
      reason?: string;
      codServiceable?: boolean;
    }
  >(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [couponCode, setCouponCode] = useState<string | null>(null);
  const [discount, setDiscount] = useState(0);
  const [couponNotice, setCouponNotice] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"prepaid" | "cod">("prepaid");

  // COD is only actually selectable once the entered pincode is confirmed
  // COD-serviceable by Delhivery (a pincode can be prepaid-only) — never
  // just "codEnabled site-wide", same never-trust-a-broader-flag-alone
  // reasoning checkPincodeServiceability's own fail-closed defaults follow.
  const codAvailableForPincode =
    codEnabled &&
    Boolean(pincodeStatus?.verified) &&
    Boolean(pincodeStatus?.serviceable) &&
    pincodeStatus?.codServiceable === true;

  // If the customer had COD selected and then changes to an address where
  // it's not serviceable, silently fall back to prepaid rather than letting
  // a stale selection reach submit (which the server would reject anyway —
  // this just avoids a confusing round-trip error for something the UI
  // already knows).
  useEffect(() => {
    if (paymentMethod === "cod" && !codAvailableForPincode) {
      setPaymentMethod("prepaid");
    }
  }, [paymentMethod, codAvailableForPincode]);

  // Restore a coupon applied on /cart — re-validate rather than trust the
  // stored discount, since stock/cart contents may have changed since.
  useEffect(() => {
    const saved = getStoredCoupon();
    if (!saved) return;
    let cancelled = false;
    applyCoupon(saved).then((res) => {
      if (cancelled) return;
      if (res.ok) {
        setCouponCode(saved);
        setDiscount(res.discount);
      } else {
        clearStoredCoupon();
        setCouponNotice(
          `Your coupon ${saved} is no longer valid and was removed.`,
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
  } = useForm<ShippingForm>({
    defaultValues: {
      // The account's own name/phone are the fallback when there's no saved
      // address to pick from; a selected address's own recipient name/phone
      // (which can legitimately differ — shipping to a family member, say)
      // takes over below once one exists.
      fullName: initialAddress?.fullName ?? prefill.fullName,
      email: prefill.email,
      phone: initialAddress?.phone ?? prefill.phone,
      line1: initialAddress?.line1 ?? "",
      line2: initialAddress?.line2 ?? "",
      city: initialAddress?.city ?? "",
      state: initialAddress?.state ?? "",
      pincode: initialAddress?.pincode ?? "",
      whatsappOptIn: true,
      saveAddress: false,
      gstNumber: "",
    },
  });

  // Fill the (single, shared) form from a saved address — or clear the
  // address fields for a fresh manual entry when `row` is null. This is the
  // only place a saved address's data ever reaches the form: from here on
  // it's just normal form state, so the same required-fields-filled check
  // and the server-side shippingAddressSchema re-validation in initCheckout
  // both apply exactly as they do to a fully hand-typed address.
  //
  // Assumption (stated per the fix protocol, no existing pattern to follow
  // here): editing a pre-filled saved address changes what's submitted for
  // THIS order only. It never calls updateAddress() on the saved record —
  // if the customer wants to keep the edited version, "save this address
  // for future orders" (manual-entry mode only, see below) adds it as a new
  // saved address rather than silently overwriting the one they started from.
  function selectAddress(row: AddressRow | null) {
    setSelectedAddressId(row?.id ?? null);
    const fields: Array<[keyof ShippingForm, string]> = row
      ? [
          ["fullName", row.fullName],
          ["phone", row.phone],
          ["line1", row.line1],
          ["line2", row.line2 ?? ""],
          ["city", row.city],
          ["state", row.state],
          ["pincode", row.pincode],
        ]
      : [
          ["fullName", ""],
          ["phone", ""],
          ["line1", ""],
          ["line2", ""],
          ["city", ""],
          ["state", ""],
          ["pincode", ""],
        ];
    for (const [field, value] of fields) {
      setValue(field, value, { shouldDirty: true });
    }
  }

  // Restore saved draft on mount (auto-save / restore per brief).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(FORM_DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw) as Partial<ShippingForm>;
      (Object.keys(draft) as (keyof ShippingForm)[]).forEach((k) => {
        // email is the signed-in account's email (read-only) — never let a
        // stale draft from a previous session overwrite it.
        if (k === "email") return;
        const v = draft[k];
        if (v !== undefined && v !== null && v !== "") {
          setValue(k, v as never, { shouldValidate: false });
        }
      });
    } catch {
      // ignore corrupt draft
    }
  }, [setValue]);

  // Auto-save on change. Subscription form instead of `watch()` at render:
  // the render form subscribes the whole component to every field, forcing a
  // full form re-render per keystroke just to write localStorage.
  useEffect(() => {
    const sub = watch((values) => {
      try {
        window.localStorage.setItem(FORM_DRAFT_KEY, JSON.stringify(values));
      } catch {
        // private mode or quota — fine
      }
    });
    return () => sub.unsubscribe();
  }, [watch]);

  // Pincode serviceability — debounced check on change.
  //
  // Trimmed here — without this, a value with stray leading/trailing
  // whitespace (common from mobile autofill/keyboard-suggestion artifacts on
  // a numeric field) fails this effect's own regex test on the raw value,
  // silently leaving pincodeStatus stuck at null forever: the serviceability
  // check below never runs, and the submit button stays disabled
  // (`!pincodeStatus` in its disabled condition) with no explanation. Same
  // whitespace class of bug already fixed once for this exact effect;
  // trimming here (rather than relying on schema validation, which no
  // longer exists client-side) is what actually prevents it now.
  const pincode = watch("pincode")?.trim() ?? "";
  const lastPin = useRef<string>("");
  useEffect(() => {
    if (!/^[1-9]\d{5}$/.test(pincode)) {
      setPincodeStatus(null);
      lastPin.current = "";
      return;
    }
    if (pincode === lastPin.current) return;
    lastPin.current = pincode;
    let cancelled = false;
    setPincodeStatus({
      serviceable: false,
      checking: true,
      verified: false,
      postalHint: null,
    });
    const t = window.setTimeout(async () => {
      const [postal, delhivery] = await Promise.all([
        fetchIndiaPostal(pincode),
        // A rejection here means the server-action round-trip itself failed
        // (network blip, cold start, etc.) — checkPincodeServiceability's own
        // try/catch already absorbs every real Delhivery-API failure and
        // fails open, so this call only ever rejects on something outside
        // Delhivery's answer. Failing this to `serviceable: false` (as this
        // used to) is indistinguishable in the UI from Delhivery genuinely
        // saying no, and intermittently rejects valid pincodes on nothing
        // more than a transient network hiccup — same class of bug as the
        // postal-lookup masking fixed above, just on the Delhivery call.
        // Fail open instead, and log so a real recurrence is visible.
        checkPincodeServiceability(pincode).catch((err) => {
          console.error(
            "[checkout] pincode serviceability call failed (network/transport error, not a Delhivery answer):",
            err,
          );
          // Fail open on general deliverability (existing behaviour) but
          // fail closed on COD — same reasoning as
          // checkPincodeServiceability's own server-side fail-closed
          // defaults for COD.
          return { serviceable: true, etaDays: "5", codServiceable: false };
        }),
      ]);
      if (cancelled) return;

      // Postal API confirmed this pincode doesn't exist — hard block.
      if (postal.status === "not_found") {
        setPincodeStatus({
          serviceable: false,
          checking: false,
          verified: false,
          postalHint: null,
          reason: "This pincode isn't in the postal database",
        });
        return;
      }

      // Postal lookup failed (timeout/5xx/blocked) — don't penalize the
      // customer for a third-party API hiccup. Skip auto-fill and defer to
      // Delhivery's own serviceability check: if Delhivery confirms it ships
      // here, treat the pincode as verified (no postal-district hint, but no
      // scary "couldn't verify" message and no submit block either) — only
      // stay unverified/blocked if Delhivery itself says it can't deliver.
      if (postal.status === "unknown") {
        setPincodeStatus({
          serviceable: delhivery.serviceable,
          checking: false,
          verified: delhivery.serviceable,
          postalHint: null,
          etaDays: delhivery.serviceable
            ? (delhivery as { etaDays?: string }).etaDays
            : undefined,
          reason: delhivery.serviceable
            ? undefined
            : "We don't deliver to this pincode yet",
          codServiceable: (delhivery as { codServiceable?: boolean }).codServiceable ?? false,
        });
        return;
      }

      // Auto-fill from the postal record: state is 1:1 with pincode so we
      // always overwrite; city we only fill if empty (users often use a
      // locality name that differs from the postal district).
      setValue("state", postal.record.state, { shouldValidate: true });
      if (!watch("city")?.trim()) {
        setValue("city", postal.record.district, { shouldValidate: true });
      }

      setPincodeStatus({
        serviceable: delhivery.serviceable,
        checking: false,
        verified: true,
        postalHint: `${postal.record.district}, ${postal.record.state}`,
        etaDays: delhivery.serviceable
          ? (delhivery as { etaDays?: string }).etaDays
          : undefined,
        reason: delhivery.serviceable
          ? undefined
          : "We don't deliver to this pincode yet",
        codServiceable: (delhivery as { codServiceable?: boolean }).codServiceable ?? false,
      });
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [pincode, setValue, watch]);

  // Simple "has something been typed" check — deliberately not format
  // validation (see REQUIRED_FIELDS' comment at the top of the file). The
  // pincode's own serviceability — a real "can we deliver here" check, not a
  // format check — still separately gates the button below via
  // pincodeStatus; this only covers "did the customer fill in the box."
  const watchedRequiredFields = watch(REQUIRED_FIELDS);
  const allRequiredFieldsFilled = watchedRequiredFields.every(
    (v) => typeof v === "string" && v.trim().length > 0,
  );

  // Shipping is free site-wide (client decision) — lib/actions/checkout.ts
  // always computes shippingFee as 0 server-side, so the preview total here
  // is just the discounted subtotal (+ the COD fee, when selected) — no
  // shipping estimate needed.
  const discountedSubtotal = Math.max(0, cart.subtotal - discount);
  const codFeePreview = paymentMethod === "cod" ? COD_CONVENIENCE_FEE_PAISE : 0;
  const previewTotal = discountedSubtotal + codFeePreview;

  const openRazorpay = useCallback(
    (
      razorpay: {
        razorpayOrderId: string;
        razorpayKeyId: string;
        amount: number;
        currency: string;
        orderNumber: string;
      },
      contact: { name: string; email: string; phone: string },
    ) => {
      const Razorpay = window.Razorpay;
      if (!Razorpay) {
        setSubmitError(
          "Payment couldn't open. Please refresh and try again.",
        );
        setSubmitting(false);
        return;
      }
      const rzp = new Razorpay({
        key: razorpay.razorpayKeyId,
        order_id: razorpay.razorpayOrderId,
        amount: razorpay.amount,
        currency: razorpay.currency,
        name: "Aarna",
        description: razorpay.orderNumber,
        prefill: {
          name: contact.name,
          email: contact.email,
          contact: contact.phone,
        },
        notes: { order_number: razorpay.orderNumber },
        theme: { color: "#4a1f1f" },
        handler: () => {
          // Server webhook confirms payment + emails invoice asynchronously.
          // Clear the draft and head to the post-payment verification page.
          try {
            window.localStorage.removeItem(FORM_DRAFT_KEY);
          } catch {
            // ignore
          }
          clearStoredCoupon();
          router.push(`/payment-processing?order=${razorpay.orderNumber}`);
        },
        modal: {
          ondismiss: () => {
            setSubmitError(
              "Payment was cancelled. Your details are saved — try again whenever you're ready.",
            );
            setSubmitting(false);
          },
        },
      });
      rzp.open();
    },
    [router],
  );

  async function onSubmit(data: ShippingForm) {
    // Belt-and-braces against a double-tap/double-submit racing ahead of
    // the disabled={submitting} button re-render (real on a slow
    // connection) — the actual guarantee against a duplicate COD order is
    // server-side (initCheckout's own advisory lock + fresh cart re-check),
    // but bailing out here means a second tap doesn't even open a second
    // in-flight request.
    if (submitting) return;
    setSubmitError(null);
    setSubmitting(true);
    // Trimmed explicitly — not a format check (nothing here gets rejected
    // for being untrimmed), just avoiding a repeat of the exact whitespace
    // bug already fixed once for the debounced pincode check above (see the
    // `pincode` const's own comment): without the removed client schema's
    // .trim(), a stray trailing space from mobile autofill would otherwise
    // reach the postal/Delhivery API calls below untouched. The server's own
    // shippingAddressSchema (lib/checkout/address-schema.ts) already trims
    // every field before validating, so this is only needed for the two
    // direct API calls happening client-side, right here, before that.
    const trimmedPincode = data.pincode.trim();
    try {
      // Belt-and-braces: at submit time, re-verify the pincode is REAL AND
      // serviceable in case the debounced check hasn't landed or the user
      // bypassed the disabled state. We never trust client gating for
      // something that would let a gibberish/unfulfillable order through.
      const [postal, gate] = await Promise.all([
        fetchIndiaPostal(trimmedPincode),
        checkPincodeServiceability(trimmedPincode),
      ]);
      if (postal.status === "not_found") {
        setPincodeStatus({
          serviceable: false,
          checking: false,
          verified: false,
          postalHint: null,
          reason: "This pincode isn't in the postal database",
        });
        throw new Error("Please enter a valid Indian pincode.");
      }
      // postal.status === "unknown" (lookup failed) falls through and defers
      // to Delhivery's own serviceability check, same as the debounced check.
      if (!gate.serviceable) {
        setPincodeStatus({
          serviceable: false,
          checking: false,
          verified: postal.status === "found",
          postalHint:
            postal.status === "found"
              ? `${postal.record.district}, ${postal.record.state}`
              : null,
          reason: "We don't deliver to this pincode yet",
          codServiceable: gate.codServiceable,
        });
        throw new Error(
          "Sorry — we don't deliver to that pincode yet.",
        );
      }

      // Same never-trust-client-gating reasoning, specifically for COD: the
      // debounced check above may be stale (address edited fast, or the
      // customer picked COD right before the pincode finished re-verifying).
      // initCheckout re-checks this again server-side regardless — this is
      // just a friendlier client-side error than a round-tripped ActionError.
      if (paymentMethod === "cod" && !gate.codServiceable) {
        setPincodeStatus({
          serviceable: gate.serviceable,
          checking: false,
          verified: true,
          postalHint:
            postal.status === "found"
              ? `${postal.record.district}, ${postal.record.state}`
              : null,
          etaDays: gate.etaDays,
          codServiceable: false,
        });
        setPaymentMethod("prepaid");
        throw new Error(
          "Cash on Delivery isn't available for this pincode — switched you to online payment.",
        );
      }

      const shippingAddress = {
        fullName: data.fullName,
        phone: data.phone,
        line1: data.line1,
        line2: data.line2 || undefined,
        city: data.city,
        state: data.state,
        pincode: trimmedPincode,
      };

      // Save to the address book if asked — best-effort, fire-and-forget.
      // Never let this delay or block payment; worst case the customer just
      // has to retype it next time.
      if (data.saveAddress) {
        createAddress(shippingAddress).catch((err) => {
          console.error("[checkout] save address failed:", err);
        });
      }

      const result = await initCheckout({
        email: data.email,
        shippingAddress,
        billingSameAsShipping: true,
        whatsappOptIn: data.whatsappOptIn,
        couponCode: couponCode ?? undefined,
        gstNumber: data.gstNumber || undefined,
        paymentMethod,
      });

      if (result.paymentMethod === "cod") {
        // Order is already fully placed (cod_pending, invoiced, confirmation
        // email sent) — nothing left to do but land on the confirmation page,
        // same cleanup Razorpay's own success handler does below.
        try {
          window.localStorage.removeItem(FORM_DRAFT_KEY);
        } catch {
          // ignore
        }
        clearStoredCoupon();
        router.push(`/order-confirmation/${result.orderNumber}`);
        return;
      }

      openRazorpay(result.razorpay, {
        name: data.fullName,
        email: data.email,
        phone: data.phone,
      });
    } catch (err) {
      const message =
        actionErrorMessage(err, "Something went wrong. Please try again.");
      setSubmitError(message);
      setSubmitting(false);
    }
  }

  return (
    <section className="paper-grain min-h-screen bg-cream px-5 pb-24 pt-[132px] md:px-6 md:pb-32 md:pt-36">
      <div className="mx-auto max-w-7xl">
        <ProgressStepper active="shipping" />

        <header className="border-b border-maroon/10 pb-8 pt-8">
          <p className="text-sm font-bold uppercase tracking-[0.24em] text-cocoa">
            Checkout
          </p>
          <h1 className="mt-4 font-display text-[44px] leading-[1.05] text-maroon md:text-6xl">
            Shipping &amp; payment
          </h1>
        </header>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="grid gap-10 pt-10 lg:grid-cols-[1.4fr_0.9fr] lg:gap-16"
          noValidate
        >
          {/* Left: shipping form */}
          <div className="space-y-10">
            <fieldset className="space-y-5">
              <Legend>Contact</Legend>
              <Field
                label="Email address"
                hint="Your order is tied to this account email"
                {...register("email")}
                type="email"
                autoComplete="email"
                readOnly
              />
              <Field
                label="Phone number"
                hint="10-digit Indian mobile"
                {...register("phone")}
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
              />
              <label className="flex cursor-pointer items-start gap-3 pt-1">
                <input
                  type="checkbox"
                  {...register("whatsappOptIn")}
                  className="mt-1 h-4 w-4 cursor-pointer accent-cocoa"
                />
                <span className="text-sm leading-6 text-charcoal/72">
                  Send order updates over WhatsApp
                </span>
              </label>
              <Field
                label="GST number"
                hint="Optional — add this for a business GST invoice"
                {...register("gstNumber")}
                placeholder="22AAAAA0000A1Z5"
                maxLength={15}
                autoComplete="off"
              />
            </fieldset>

            <fieldset className="space-y-5">
              <div className="flex items-center gap-3">
                <Legend>Shipping address</Legend>
                {pincodeStatus?.verified && pincodeStatus.serviceable ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-cocoa/30 bg-cocoa/6 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-cocoa">
                    <Check className="h-2.5 w-2.5" aria-hidden="true" />
                    verified
                  </span>
                ) : null}
              </div>

              {addresses.length > 0 ? (
                <div className="space-y-2.5" role="radiogroup" aria-label="Choose a saved address">
                  {addresses.map((addr) => (
                    <SavedAddressOption
                      key={addr.id}
                      address={addr}
                      selected={selectedAddressId === addr.id}
                      onSelect={() => selectAddress(addr)}
                    />
                  ))}
                  <button
                    type="button"
                    onClick={() => selectAddress(null)}
                    className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3.5 text-left transition duration-500 ${
                      selectedAddressId === null
                        ? "border-cocoa bg-cocoa/6"
                        : "border-cocoa/18 hover:border-cocoa/40"
                    }`}
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-cocoa/30 text-cocoa">
                      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    </span>
                    <span className="text-sm font-medium text-charcoal/80">
                      Add a new address
                    </span>
                  </button>
                </div>
              ) : null}

              <Field
                label="Full name"
                {...register("fullName")}
                autoComplete="name"
              />
              <Field
                label="Address line 1"
                {...register("line1")}
                autoComplete="address-line1"
              />
              <Field
                label="Address line 2"
                hint="Apartment, suite, landmark (optional)"
                {...register("line2")}
                autoComplete="address-line2"
              />
              <div className="grid gap-5 sm:grid-cols-2">
                <Field
                  label="City"
                  {...register("city")}
                  autoComplete="address-level2"
                />
                <Field
                  label="State"
                  {...register("state")}
                  autoComplete="address-level1"
                />
              </div>
              <div>
                <Field
                  label="PIN code"
                  {...register("pincode")}
                  inputMode="numeric"
                  autoComplete="postal-code"
                  maxLength={6}
                />
                {pincodeStatus ? (
                  <p
                    className={`mt-2 text-xs tracking-wide ${
                      pincodeStatus.checking
                        ? "text-charcoal/55"
                        : pincodeStatus.verified && pincodeStatus.serviceable
                          ? "text-cocoa"
                          : "text-burnt-red"
                    }`}
                  >
                    {pincodeStatus.checking
                      ? "Verifying address…"
                      : !pincodeStatus.verified
                        ? (pincodeStatus.reason ??
                          "We couldn't verify this pincode")
                        : !pincodeStatus.serviceable
                          ? (pincodeStatus.reason ??
                            "Sorry, we don't deliver here yet")
                          : `✓ Verified${
                              pincodeStatus.postalHint
                                ? ` · ${pincodeStatus.postalHint}`
                                : ""
                            }${
                              pincodeStatus.etaDays
                                ? ` · Delivery in ${pincodeStatus.etaDays} days`
                                : ""
                            }`}
                  </p>
                ) : null}
              </div>
              {/* Only offered in manual-entry mode — picking an already-saved
                  address has nothing new to save, and an edited saved
                  address is deliberately "this order only" (see
                  selectAddress above); this checkbox is how a customer adds
                  an edited or brand-new address to their book on purpose. */}
              {selectedAddressId === null ? (
                <label className="flex cursor-pointer items-start gap-3 pt-1">
                  <input
                    type="checkbox"
                    {...register("saveAddress")}
                    className="mt-1 h-4 w-4 cursor-pointer accent-cocoa"
                  />
                  <span className="text-sm leading-6 text-charcoal/72">
                    Save this address for future orders
                  </span>
                </label>
              ) : null}
            </fieldset>

            {codEnabled ? (
              <fieldset className="space-y-3">
                <Legend>Payment</Legend>
                <div className="space-y-2.5" role="radiogroup" aria-label="Choose a payment method">
                  <PaymentOption
                    icon={<ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />}
                    label="Pay online"
                    hint="Card, UPI, netbanking — via Razorpay"
                    selected={paymentMethod === "prepaid"}
                    onSelect={() => setPaymentMethod("prepaid")}
                  />
                  <PaymentOption
                    icon={<Banknote className="h-3.5 w-3.5" aria-hidden="true" />}
                    label={`Cash on Delivery · pay ${formatINR(COD_CONVENIENCE_FEE_PAISE)} extra`}
                    hint={
                      codAvailableForPincode
                        ? "Pay in cash when your order arrives"
                        : pincodeStatus?.verified && pincodeStatus.serviceable
                          ? "Not available for this pincode"
                          : "Verify your pincode above to check availability"
                    }
                    selected={paymentMethod === "cod"}
                    disabled={!codAvailableForPincode}
                    onSelect={() => setPaymentMethod("cod")}
                  />
                </div>
              </fieldset>
            ) : null}

            <TrustStrip />

            <div className="space-y-4">
              <button
                type="submit"
                disabled={
                  submitting ||
                  !allRequiredFieldsFilled ||
                  !pincodeStatus ||
                  pincodeStatus.checking ||
                  !pincodeStatus.verified ||
                  !pincodeStatus.serviceable ||
                  (paymentMethod === "cod" && !codAvailableForPincode)
                }
                className="group/cta flex min-h-[60px] w-full items-center justify-center rounded-2xl bg-maroon px-6 shadow-[0_18px_40px_rgba(74,31,31,0.22)] transition duration-700 hover:bg-maroon/90 hover:shadow-[0_22px_52px_rgba(74,31,31,0.3)] disabled:opacity-50 disabled:hover:bg-maroon disabled:hover:shadow-[0_18px_40px_rgba(74,31,31,0.22)]"
              >
                <span className="flex items-center gap-3 text-[12px] font-medium uppercase tracking-[0.24em] text-cream">
                  <Lock className="h-4 w-4" aria-hidden="true" />
                  {submitting
                    ? paymentMethod === "cod"
                      ? "Placing your order…"
                      : "Opening secure payment…"
                    : paymentMethod === "cod"
                      ? `Place order · Pay ${formatINR(previewTotal)} on delivery`
                      : `Continue to secure payment · ${formatINR(previewTotal)}`}
                  {!submitting ? (
                    <ArrowRight
                      className="h-4 w-4 transition-transform duration-500 group-hover/cta:translate-x-1"
                      aria-hidden="true"
                    />
                  ) : null}
                </span>
              </button>
              {submitError ? (
                <p className="text-center text-xs tracking-wide text-burnt-red">
                  {submitError}
                </p>
              ) : null}
              <p className="text-center text-xs leading-6 text-charcoal/50">
                {paymentMethod === "cod"
                  ? "Keep the amount ready in cash for the courier at delivery."
                  : "You’ll be securely redirected to Razorpay to complete your payment."}
              </p>
            </div>

            <CheckoutFooter />
          </div>

          {/* Right: sticky order summary */}
          <aside className="lg:sticky lg:top-[var(--header-offset)] lg:self-start lg:transition-[top] lg:duration-500">
            <div className="rounded-[28px] border border-cocoa/12 bg-cream/85 p-6 shadow-[0_18px_55px_rgba(43,38,35,0.06)] backdrop-blur-sm md:p-8">
              <h2 className="font-display text-3xl leading-tight text-maroon">
                Order summary
              </h2>
              <p className="mt-1 text-sm text-charcoal/55">
                {cart.itemCount}{" "}
                {cart.itemCount === 1 ? "piece" : "pieces"} held for you
              </p>

              <ul className="mt-6 divide-y divide-cocoa/10">
                {cart.lines.map((line) => (
                  <li key={line.variantId} className="flex gap-4 py-4 first:pt-0">
                    <div className="relative h-[78px] w-[60px] shrink-0 overflow-hidden rounded-xl bg-cream">
                      {line.imageUrl ? (
                        // Plain img keeps the summary lightweight; no need for
                        // next/image optimisation on tiny thumbnails.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={line.imageUrl}
                          alt={line.productTitle}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="cloth-window h-full w-full" />
                      )}
                    </div>
                    <div className="flex flex-1 flex-col justify-between text-sm">
                      <div>
                        <p className="font-display text-base leading-snug text-maroon">
                          {line.productTitle}
                        </p>
                        {line.variantLabel ? (
                          <p className="mt-0.5 text-xs text-charcoal/55">
                            {line.variantLabel} · qty {line.quantity}
                          </p>
                        ) : (
                          <p className="mt-0.5 text-xs text-charcoal/55">
                            qty {line.quantity}
                          </p>
                        )}
                      </div>
                      <p className="text-right text-charcoal">
                        {formatINR(line.unitPrice * line.quantity)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>

              {couponNotice ? (
                <p className="mt-4 rounded-xl border border-cocoa/20 bg-cocoa/6 px-4 py-2.5 text-xs leading-5 text-cocoa">
                  {couponNotice}
                </p>
              ) : null}

              <dl className="mt-6 space-y-3 border-t border-maroon/10 pt-6 text-sm text-charcoal/70">
                <Row label="Subtotal" value={formatINR(cart.subtotal)} />
                {discount > 0 ? (
                  <Row
                    label={`Discount${couponCode ? ` (${couponCode})` : ""}`}
                    value={`−${formatINR(discount)}`}
                  />
                ) : null}
                <Row label="Shipping" value="Free" />
                {codFeePreview > 0 ? (
                  <Row label="Cash on Delivery fee" value={formatINR(codFeePreview)} />
                ) : null}
                <Row label="Taxes" value="Inclusive" muted />
              </dl>

              <div className="mt-5 flex items-baseline justify-between border-t border-maroon/10 pt-5">
                <span className="text-sm font-bold uppercase tracking-[0.24em] text-cocoa">
                  Total
                </span>
                <span className="font-display text-3xl text-maroon">
                  {formatINR(previewTotal)}
                </span>
              </div>
            </div>
          </aside>
        </form>
      </div>
    </section>
  );
}

function PaymentOption({
  icon,
  label,
  hint,
  selected,
  disabled,
  onSelect,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={`flex w-full items-start gap-3 rounded-2xl border px-4 py-3.5 text-left transition duration-500 ${
        disabled
          ? "cursor-not-allowed border-cocoa/10 opacity-50"
          : selected
            ? "border-cocoa bg-cocoa/6"
            : "border-cocoa/18 hover:border-cocoa/40"
      }`}
    >
      <span
        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${
          selected && !disabled
            ? "border-cocoa bg-cocoa text-cream"
            : "border-cocoa/30 text-cocoa"
        }`}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-charcoal/85">
          {label}
        </span>
        {hint ? (
          <span className="mt-0.5 block text-xs leading-5 text-charcoal/55">
            {hint}
          </span>
        ) : null}
      </span>
    </button>
  );
}

function SavedAddressOption({
  address,
  selected,
  onSelect,
}: {
  address: AddressRow;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`flex w-full items-start gap-3 rounded-2xl border px-4 py-3.5 text-left transition duration-500 ${
        selected ? "border-cocoa bg-cocoa/6" : "border-cocoa/18 hover:border-cocoa/40"
      }`}
    >
      <span
        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${
          selected ? "border-cocoa bg-cocoa text-cream" : "border-cocoa/30 text-cocoa"
        }`}
      >
        <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-display text-lg text-maroon">
            {address.fullName}
          </span>
          {address.isDefault ? (
            <span className="rounded-full border border-cocoa/25 bg-cocoa/8 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-cocoa">
              Default
            </span>
          ) : null}
        </span>
        <span className="mt-1 block text-sm leading-6 text-charcoal/70">
          {address.line1}
          {address.line2 ? `, ${address.line2}` : ""}, {address.city},{" "}
          {address.state} {address.pincode}
        </span>
      </span>
    </button>
  );
}

function Legend({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-sm font-bold uppercase tracking-[0.24em] text-cocoa">
      {children}
    </p>
  );
}

interface FieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
}
const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, hint, ...rest },
  ref,
) {
  return (
    <label className="block">
      <span className="block text-[11px] font-medium uppercase tracking-[0.18em] text-charcoal/65">
        {label}
      </span>
      <input
        ref={ref}
        {...rest}
        className="mt-2 block w-full rounded-xl border border-cocoa/18 bg-cream px-4 py-3 text-base text-charcoal outline-none transition duration-500 placeholder:text-charcoal/35 focus:border-cocoa"
      />
      {hint ? (
        <span className="mt-1.5 block text-xs text-charcoal/50">
          {hint}
        </span>
      ) : null}
    </label>
  );
});

function Row({
  label,
  value,
  muted,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <dt>{label}</dt>
      <dd className={muted ? "text-xs text-charcoal/50" : "text-charcoal"}>
        {value}
      </dd>
    </div>
  );
}

function ProgressStepper({
  active,
}: {
  active: "cart" | "login" | "shipping" | "payment" | "confirmation";
}) {
  const steps: Array<{ id: typeof active; label: string }> = [
    { id: "cart", label: "Cart" },
    { id: "login", label: "Login" },
    { id: "shipping", label: "Shipping" },
    { id: "payment", label: "Payment" },
    { id: "confirmation", label: "Confirmation" },
  ];
  const activeIdx = steps.findIndex((s) => s.id === active);
  return (
    <ol
      aria-label="Checkout progress"
      className="flex flex-wrap items-center justify-center gap-x-2 gap-y-3 pt-2 md:gap-x-4"
    >
      {steps.map((step, i) => {
        const done = i < activeIdx;
        const current = i === activeIdx;
        return (
          <li key={step.id} className="flex items-center gap-2 md:gap-4">
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className={`flex h-7 w-7 items-center justify-center rounded-full text-[11px] tabular-nums transition duration-700 ${
                  done
                    ? "bg-cocoa text-cream"
                    : current
                      ? "bg-maroon text-cream ring-4 ring-maroon/15"
                      : "border border-cocoa/25 text-charcoal/45"
                }`}
              >
                {done ? <Check className="h-3 w-3" aria-hidden="true" /> : i + 1}
              </span>
              <span
                className={`text-[11px] font-medium uppercase tracking-[0.18em] ${
                  current ? "text-maroon" : done ? "text-cocoa" : "text-charcoal/40"
                }`}
              >
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 ? (
              <span
                aria-hidden="true"
                className={`hidden h-px w-8 md:block ${
                  done ? "bg-cocoa/55" : "bg-cocoa/20"
                }`}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function TrustStrip() {
  const items = [
    { Icon: ShieldCheck, label: "SSL encrypted checkout" },
    { Icon: Lock, label: "100% secure payments" },
    { Icon: Truck, label: "Fast & reliable shipping" },
  ];
  return (
    <div className="grid gap-3 rounded-2xl border border-cocoa/12 bg-cream/60 px-5 py-4 text-[11px] uppercase tracking-[0.16em] text-charcoal/65 sm:grid-cols-3">
      {items.map(({ Icon, label }) => (
        <div key={label} className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-cocoa" aria-hidden="true" />
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}

function CheckoutFooter() {
  const links = [
    { href: "/return-policy", label: "Return policy" },
    { href: "/shipping-policy", label: "Shipping policy" },
    { href: "/privacy-policy", label: "Privacy policy" },
    { href: "/terms", label: "Terms & conditions" },
  ];
  return (
    <div className="border-t border-cocoa/14 pt-6 text-center">
      <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs text-charcoal/55">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="soft-link">
            {l.label}
          </Link>
        ))}
      </div>
      <p className="mt-4 text-xs text-charcoal/50">
        Need help with your order? Our support team is here to assist you.
      </p>
    </div>
  );
}
