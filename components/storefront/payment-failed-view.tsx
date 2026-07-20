import Link from "next/link";
import { AlertCircle, ArrowLeft, ArrowRight, Check, Clock, RotateCw } from "lucide-react";

interface PaymentFailedViewProps {
  orderNumber: string | null;
  paymentStatus:
    | "pending"
    | "paid"
    | "failed"
    | "refunded"
    | "partially_refunded"
    | null;
}

const PENDING_MESSAGE =
  "Your payment is still being verified. We'll automatically update your order status once confirmation is received.";
const FAILED_MESSAGE =
  "Your order has not been placed because we couldn't verify your payment. No payment will be charged unless the transaction is successful.";
const PAID_MESSAGE =
  "Good news — this order was paid successfully. There's nothing more to do here.";
const REFUNDED_MESSAGE =
  "This order was refunded. Check your account for the refund details.";

export function PaymentFailedView({
  orderNumber,
  paymentStatus,
}: PaymentFailedViewProps) {
  const isPending = paymentStatus === "pending";
  const isPaid = paymentStatus === "paid";
  const isRefunded =
    paymentStatus === "refunded" || paymentStatus === "partially_refunded";
  // A retry only makes sense when the payment genuinely never went through —
  // never show it for an order that's already paid or already refunded, since
  // that's an actual charge, not a failure to recover from.
  const isResolved = isPaid || isRefunded;

  const eyebrow = isPending
    ? "Payment pending"
    : isPaid
      ? "Payment successful"
      : isRefunded
        ? "Order refunded"
        : "Payment unsuccessful";
  const heading = isPending
    ? "We're still verifying"
    : isPaid
      ? "Your payment went through"
      : isRefunded
        ? "This order was refunded"
        : "Payment couldn't be completed";
  const message = isPending
    ? PENDING_MESSAGE
    : isPaid
      ? PAID_MESSAGE
      : isRefunded
        ? REFUNDED_MESSAGE
        : FAILED_MESSAGE;
  const statusValue = isPending
    ? "Pending verification"
    : isPaid
      ? "Paid"
      : paymentStatus === "refunded"
        ? "Refunded"
        : paymentStatus === "partially_refunded"
          ? "Partially refunded"
          : paymentStatus === "failed"
            ? "Failed"
            : "Not completed";

  return (
    <section className="paper-grain min-h-screen bg-cream px-5 pb-24 pt-[128px] md:px-6 md:pt-36">
      <div className="mx-auto max-w-2xl">
        <header className="flex flex-col items-center text-center">
          {isPending ? (
            <PendingMark />
          ) : isResolved ? (
            <ResolvedMark />
          ) : (
            <FailedMark />
          )}
          <p className="mt-8 text-sm font-bold uppercase tracking-[0.24em] text-cocoa">
            {eyebrow}
          </p>
          <h1 className="mt-4 font-display text-[36px] leading-[1.06] text-maroon md:text-5xl">
            {heading}
          </h1>
          <p className="mt-5 max-w-lg text-base leading-7 text-charcoal/65">
            {message}
          </p>
        </header>

        <div className="mt-10 rounded-[28px] border border-cocoa/12 bg-cream/85 p-6 shadow-[0_18px_55px_rgba(43,38,35,0.06)] backdrop-blur-sm md:p-8">
          <dl className="space-y-4 text-sm">
            <Detail
              label="Payment status"
              value={statusValue}
              tone={isPending ? "warn" : isResolved ? "ok" : "fail"}
            />
            {orderNumber ? (
              <Detail label="Order id" value={orderNumber} mono />
            ) : null}
          </dl>
        </div>

        {/* Buttons — per brief: Retry · Return to Checkout · Return to Cart */}
        <div className="mt-10 space-y-3">
          {isResolved ? (
            <Link
              href="/account/orders"
              className="group/cta flex min-h-[60px] items-center justify-center rounded-2xl bg-maroon px-6 shadow-[0_18px_40px_rgba(74,31,31,0.22)] transition duration-700 hover:bg-maroon/90 hover:shadow-[0_22px_52px_rgba(74,31,31,0.3)]"
            >
              <span className="flex items-center gap-3 text-[12px] font-medium uppercase tracking-[0.24em] text-cream">
                View your order
                <ArrowRight
                  className="h-4 w-4 transition-transform duration-500 group-hover/cta:translate-x-1"
                  aria-hidden="true"
                />
              </span>
            </Link>
          ) : !isPending ? (
            <Link
              href="/checkout"
              className="group/cta flex min-h-[60px] items-center justify-center rounded-2xl bg-maroon px-6 shadow-[0_18px_40px_rgba(74,31,31,0.22)] transition duration-700 hover:bg-maroon/90 hover:shadow-[0_22px_52px_rgba(74,31,31,0.3)]"
            >
              <span className="flex items-center gap-3 text-[12px] font-medium uppercase tracking-[0.24em] text-cream">
                <RotateCw className="h-4 w-4" aria-hidden="true" />
                Retry payment
                <ArrowRight
                  className="h-4 w-4 transition-transform duration-500 group-hover/cta:translate-x-1"
                  aria-hidden="true"
                />
              </span>
            </Link>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <Link
              href="/checkout"
              className="flex min-h-[52px] items-center justify-center rounded-2xl border border-cocoa/24 bg-cream px-6 transition duration-700 hover:bg-cocoa/8"
            >
              <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.24em] text-cocoa">
                return to checkout
              </span>
            </Link>
            <Link
              href="/cart"
              className="flex min-h-[52px] items-center justify-center rounded-2xl border border-cocoa/24 bg-cream px-6 transition duration-700 hover:bg-cocoa/8"
            >
              <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.24em] text-cocoa">
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                return to cart
              </span>
            </Link>
          </div>
          <p className="pt-3 text-center text-xs leading-6 text-charcoal/50">
            Need help?{" "}
            <Link href="/contact" className="soft-link font-medium text-cocoa">
              Our support team is here to assist you.
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
}

function FailedMark() {
  return (
    <div className="relative flex h-24 w-24 items-center justify-center">
      <span
        aria-hidden="true"
        className="absolute inset-0 rounded-full bg-burnt-red/10"
      />
      <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-burnt-red shadow-[0_18px_40px_rgba(122,59,50,0.22)]">
        <AlertCircle className="h-6 w-6 text-cream" aria-hidden="true" />
      </span>
    </div>
  );
}

function PendingMark() {
  return (
    <div className="relative flex h-24 w-24 items-center justify-center">
      <span
        aria-hidden="true"
        className="absolute inset-0 rounded-full bg-cocoa/12"
      />
      <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-cocoa shadow-[0_18px_40px_rgba(140,106,90,0.22)]">
        <Clock className="h-6 w-6 text-cream" aria-hidden="true" />
      </span>
    </div>
  );
}

function ResolvedMark() {
  return (
    <div className="relative flex h-24 w-24 items-center justify-center">
      <span
        aria-hidden="true"
        className="absolute inset-0 rounded-full bg-cocoa/12"
      />
      <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-cocoa shadow-[0_18px_40px_rgba(140,106,90,0.22)]">
        <Check className="h-6 w-6 text-cream" aria-hidden="true" />
      </span>
    </div>
  );
}

interface DetailProps {
  label: string;
  value: string;
  mono?: boolean;
  tone?: "warn" | "fail" | "ok";
}
function Detail({ label, value, mono, tone }: DetailProps) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-[11px] font-medium uppercase tracking-[0.18em] text-charcoal/55">
        {label}
      </dt>
      <dd
        className={`text-right ${
          mono ? "font-medium tracking-wider tabular-nums" : ""
        } ${
          tone === "fail"
            ? "text-burnt-red"
            : tone === "warn" || tone === "ok"
              ? "text-cocoa"
              : "text-charcoal/85"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
