"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Lock, ShieldCheck, Truck } from "lucide-react";
import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  checkPincodeServiceability,
  initCheckout,
} from "@/lib/actions/checkout";
import { createAddress } from "@/lib/actions/account";
import { applyCoupon } from "@/lib/actions/cart";
import { clearStoredCoupon, getStoredCoupon } from "@/lib/cart/coupon-storage";
import type { CartState } from "@/lib/types";
import { formatINR } from "@/lib/utils";
import { actionErrorMessage } from "@/lib/action-error";
import { GSTIN_PATTERN } from "@/lib/gst";

const FREE_SHIPPING_THRESHOLD = 299900; // ₹2,999 (matches backend)
const FORM_DRAFT_KEY = "aarna-checkout-draft";

// Strong validators — block gibberish before it hits the DB. Every rule here
// exists because a real customer's typo shouldn't slip through, but a bot or
// mash-of-keys should.
const shippingSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(3, "Please enter your full name")
    .max(100)
    .regex(/^[a-zA-Z][a-zA-Z\s.'\-]*$/, "Letters only, please")
    .refine((v) => /\s/.test(v.trim()), "Please enter first and last name")
    .refine(
      (v) => !/^(.)\1+$/.test(v.trim().replace(/\s/g, "")),
      "Please enter a real name",
    ),
  phone: z
    .string()
    .trim()
    .regex(/^[6-9]\d{9}$/, "10-digit Indian mobile (starts 6-9)"),
  email: z.string().trim().email("Valid email address required"),
  line1: z
    .string()
    .trim()
    .min(5, "Please add more detail")
    .max(200)
    .refine(
      (v) => (v.match(/[a-zA-Z]/g) || []).length >= 3,
      "Include street or area name",
    ),
  line2: z.string().trim().max(200).optional().or(z.literal("")),
  city: z
    .string()
    .trim()
    .min(2, "City required")
    .max(100)
    .regex(/^[a-zA-Z][a-zA-Z\s.\-]*$/, "Letters only"),
  state: z.string().trim().min(2, "State required").max(60),
  pincode: z
    .string()
    .trim()
    .regex(/^[1-9]\d{5}$/, "6-digit PIN code"),
  whatsappOptIn: z.boolean(),
  saveAddress: z.boolean(),
  // Optional — only business buyers who want a GST invoice fill this in, but
  // if they do, it must be a real GSTIN. Uppercased so a copy-pasted
  // lowercase GSTIN still validates.
  gstNumber: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase())
    .refine(
      (v) => v.length === 0 || GSTIN_PATTERN.test(v),
      "Enter a valid 15-character GSTIN",
    ),
});

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

type ShippingForm = z.infer<typeof shippingSchema>;

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
}

export function CheckoutView({ cart, prefill }: CheckoutViewProps) {
  const router = useRouter();
  const [pincodeStatus, setPincodeStatus] = useState<
    null | {
      serviceable: boolean;
      checking: boolean;
      verified: boolean;
      postalHint: string | null;
      etaDays?: number;
      reason?: string;
    }
  >(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [couponCode, setCouponCode] = useState<string | null>(null);
  const [discount, setDiscount] = useState(0);
  const [couponNotice, setCouponNotice] = useState<string | null>(null);

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
    formState: { errors, isValid },
  } = useForm<ShippingForm>({
    resolver: zodResolver(shippingSchema),
    mode: "onBlur",
    defaultValues: {
      fullName: prefill.fullName,
      email: prefill.email,
      phone: prefill.phone,
      line1: "",
      line2: "",
      city: "",
      state: "",
      pincode: "",
      whatsappOptIn: true,
      saveAddress: false,
      gstNumber: "",
    },
  });

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
  const pincode = watch("pincode");
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
          return { serviceable: true, etaDays: 5 };
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
            ? (delhivery as { etaDays?: number }).etaDays
            : undefined,
          reason: delhivery.serviceable
            ? undefined
            : "We don't deliver to this pincode yet",
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
          ? (delhivery as { etaDays?: number }).etaDays
          : undefined,
        reason: delhivery.serviceable
          ? undefined
          : "We don't deliver to this pincode yet",
      });
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [pincode, setValue, watch]);

  // Estimated shipping fee for the summary preview. Backend re-computes the
  // authoritative number when initCheckout runs.
  const discountedSubtotal = Math.max(0, cart.subtotal - discount);
  const estimatedShipping = useMemo(
    () => (discountedSubtotal >= FREE_SHIPPING_THRESHOLD ? 0 : 9900),
    [discountedSubtotal],
  );
  const previewTotal = discountedSubtotal + estimatedShipping;
  const remainingForFreeShipping = Math.max(
    0,
    FREE_SHIPPING_THRESHOLD - discountedSubtotal,
  );

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
    setSubmitError(null);
    setSubmitting(true);
    try {
      // Belt-and-braces: at submit time, re-verify the pincode is REAL AND
      // serviceable in case the debounced check hasn't landed or the user
      // bypassed the disabled state. We never trust client gating for
      // something that would let a gibberish/unfulfillable order through.
      const [postal, gate] = await Promise.all([
        fetchIndiaPostal(data.pincode),
        checkPincodeServiceability(data.pincode),
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
        });
        throw new Error(
          "Sorry — we don't deliver to that pincode yet.",
        );
      }

      const shippingAddress = {
        fullName: data.fullName,
        phone: data.phone,
        line1: data.line1,
        line2: data.line2 || undefined,
        city: data.city,
        state: data.state,
        pincode: data.pincode,
      };

      // Save to the address book if asked — best-effort, fire-and-forget.
      // Never let this delay or block payment; worst case the customer just
      // has to retype it next time.
      if (data.saveAddress) {
        createAddress(shippingAddress).catch((err) => {
          console.error("[checkout] save address failed:", err);
        });
      }

      const { razorpay } = await initCheckout({
        email: data.email,
        shippingAddress,
        billingSameAsShipping: true,
        whatsappOptIn: data.whatsappOptIn,
        couponCode: couponCode ?? undefined,
        gstNumber: data.gstNumber || undefined,
      });
      openRazorpay(razorpay, {
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
                error={errors.email?.message}
                {...register("email")}
                type="email"
                autoComplete="email"
                readOnly
              />
              <Field
                label="Phone number"
                hint="10-digit indian mobile"
                error={errors.phone?.message}
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
                error={errors.gstNumber?.message}
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
              <Field
                label="Full name"
                error={errors.fullName?.message}
                {...register("fullName")}
                autoComplete="name"
              />
              <Field
                label="Address line 1"
                error={errors.line1?.message}
                {...register("line1")}
                autoComplete="address-line1"
              />
              <Field
                label="Address line 2"
                hint="Apartment, suite, landmark (optional)"
                error={errors.line2?.message}
                {...register("line2")}
                autoComplete="address-line2"
              />
              <div className="grid gap-5 sm:grid-cols-2">
                <Field
                  label="City"
                  error={errors.city?.message}
                  {...register("city")}
                  autoComplete="address-level2"
                />
                <Field
                  label="State"
                  error={errors.state?.message}
                  {...register("state")}
                  autoComplete="address-level1"
                />
              </div>
              <div>
                <Field
                  label="PIN code"
                  error={errors.pincode?.message}
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
                                ? ` · ~${pincodeStatus.etaDays} days`
                                : ""
                            }`}
                  </p>
                ) : null}
              </div>
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
            </fieldset>

            <TrustStrip />

            <div className="space-y-4">
              <button
                type="submit"
                disabled={
                  submitting ||
                  !isValid ||
                  !pincodeStatus ||
                  pincodeStatus.checking ||
                  !pincodeStatus.verified ||
                  !pincodeStatus.serviceable
                }
                className="group/cta flex min-h-[60px] w-full items-center justify-center rounded-2xl bg-maroon px-6 shadow-[0_18px_40px_rgba(74,31,31,0.22)] transition duration-700 hover:bg-maroon/90 hover:shadow-[0_22px_52px_rgba(74,31,31,0.3)] disabled:opacity-50 disabled:hover:bg-maroon disabled:hover:shadow-[0_18px_40px_rgba(74,31,31,0.22)]"
              >
                <span className="flex items-center gap-3 text-[12px] font-medium uppercase tracking-[0.24em] text-cream">
                  <Lock className="h-4 w-4" aria-hidden="true" />
                  {submitting
                    ? "Opening secure payment…"
                    : `continue to secure payment · ${formatINR(previewTotal)}`}
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
                You&rsquo;ll be securely redirected to Razorpay to complete
                your payment.
              </p>
            </div>

            <CheckoutFooter />
          </div>

          {/* Right: sticky order summary */}
          <aside className="lg:sticky lg:top-[116px] lg:self-start">
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
                    label={`discount${couponCode ? ` (${couponCode})` : ""}`}
                    value={`−${formatINR(discount)}`}
                  />
                ) : null}
                <Row
                  label="Shipping"
                  value={
                    estimatedShipping === 0
                      ? "free"
                      : formatINR(estimatedShipping)
                  }
                />
                <Row label="Taxes" value="Inclusive" muted />
                {remainingForFreeShipping > 0 ? (
                  <p className="pt-1 text-xs leading-5 text-cocoa/85">
                    Add {formatINR(remainingForFreeShipping)} more for free
                    shipping
                  </p>
                ) : (
                  <p className="pt-1 text-xs leading-5 text-cocoa">
                    You&rsquo;ve qualified for free shipping
                  </p>
                )}
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
  error?: string;
}
const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, hint, error, ...rest },
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
        className={`mt-2 block w-full rounded-xl border bg-cream px-4 py-3 text-base text-charcoal outline-none transition duration-500 placeholder:text-charcoal/35 focus:border-cocoa ${
          error ? "border-burnt-red/60" : "border-cocoa/18"
        }`}
      />
      {hint && !error ? (
        <span className="mt-1.5 block text-xs text-charcoal/50">
          {hint}
        </span>
      ) : null}
      {error ? (
        <span className="mt-1.5 block text-xs text-burnt-red">
          {error}
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
