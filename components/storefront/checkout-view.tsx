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
import { applyCoupon } from "@/lib/actions/cart";
import { clearStoredCoupon, getStoredCoupon } from "@/lib/cart/coupon-storage";
import type { CartState } from "@/lib/types";
import { formatINR } from "@/lib/utils";
import { actionErrorMessage } from "@/lib/action-error";

const FREE_SHIPPING_THRESHOLD = 299900; // ₹2,999 (matches backend)
const FORM_DRAFT_KEY = "aarna-checkout-draft";

const shippingSchema = z.object({
  fullName: z.string().trim().min(2, "Please enter your full name").max(100),
  phone: z
    .string()
    .trim()
    .regex(/^\d{10}$/, "10-digit phone number"),
  email: z.string().trim().email("Valid email address required"),
  line1: z.string().trim().min(3, "Address line 1 required").max(200),
  line2: z.string().trim().max(200).optional().or(z.literal("")),
  city: z.string().trim().min(2, "City required").max(100),
  state: z.string().trim().min(2, "State required").max(60),
  pincode: z.string().trim().regex(/^\d{6}$/, "6-digit PIN code"),
  whatsappOptIn: z.boolean(),
});

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
    null | { serviceable: boolean; checking: boolean; etaDays?: number }
  >(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [couponCode, setCouponCode] = useState<string | null>(null);
  const [discount, setDiscount] = useState(0);

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
    },
  });

  // Restore saved draft on mount (auto-save / restore per brief).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(FORM_DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw) as Partial<ShippingForm>;
      (Object.keys(draft) as (keyof ShippingForm)[]).forEach((k) => {
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
    if (!/^\d{6}$/.test(pincode)) {
      setPincodeStatus(null);
      lastPin.current = "";
      return;
    }
    if (pincode === lastPin.current) return;
    lastPin.current = pincode;
    let cancelled = false;
    setPincodeStatus({ serviceable: false, checking: true });
    const t = window.setTimeout(async () => {
      try {
        const res = await checkPincodeServiceability(pincode);
        if (!cancelled) {
          setPincodeStatus({ ...res, checking: false });
        }
      } catch {
        if (!cancelled) {
          setPincodeStatus({ serviceable: true, checking: false });
        }
      }
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [pincode]);

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
              "payment was cancelled. your details are saved — try again whenever you're ready.",
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
      const { razorpay } = await initCheckout({
        email: data.email,
        shippingAddress: {
          fullName: data.fullName,
          phone: data.phone,
          line1: data.line1,
          line2: data.line2 || undefined,
          city: data.city,
          state: data.state,
          pincode: data.pincode,
        },
        billingSameAsShipping: true,
        whatsappOptIn: data.whatsappOptIn,
        couponCode: couponCode ?? undefined,
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
                error={errors.email?.message}
                {...register("email")}
                type="email"
                autoComplete="email"
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
            </fieldset>

            <fieldset className="space-y-5">
              <Legend>Shipping address</Legend>
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
                        : pincodeStatus.serviceable
                          ? "text-cocoa"
                          : "text-burnt-red"
                    }`}
                  >
                    {pincodeStatus.checking
                      ? "Checking serviceability…"
                      : pincodeStatus.serviceable
                        ? "We deliver to this pincode"
                        : "sorry, we don't deliver here yet"}
                  </p>
                ) : null}
              </div>
            </fieldset>

            <TrustStrip />

            <div className="space-y-4">
              <button
                type="submit"
                disabled={
                  submitting ||
                  !isValid ||
                  (pincodeStatus !== null &&
                    !pincodeStatus.checking &&
                    !pincodeStatus.serviceable)
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
          <aside className="lg:sticky lg:top-36 lg:self-start">
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
