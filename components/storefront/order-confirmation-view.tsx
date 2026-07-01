import Link from "next/link";
import { ArrowRight, Check, MapPin, ShieldCheck } from "lucide-react";
import type { AddressInput } from "@/lib/types";

interface OrderConfirmationViewProps {
  orderNumber: string;
  shipping: AddressInput | null;
  hasDetail: boolean;
  paymentStatus:
    | "pending"
    | "paid"
    | "failed"
    | "refunded"
    | "partially_refunded"
    | null;
}

const SUPPORT_NOTE =
  "You'll receive your order confirmation, shipment tracking, and delivery updates via SMS and email once your order has been processed.";

export function OrderConfirmationView({
  orderNumber,
  shipping,
  hasDetail,
  paymentStatus,
}: OrderConfirmationViewProps) {
  const stillVerifying = hasDetail && paymentStatus === "pending";

  return (
    <section className="paper-grain min-h-screen bg-cream px-5 pb-24 pt-[128px] md:px-6 md:pt-36">
      <div className="mx-auto max-w-3xl">
        <header className="fade-rise flex flex-col items-center text-center">
          <SuccessMark />
          <p className="mt-8 text-sm font-bold uppercase tracking-[0.24em] text-cocoa">
            {stillVerifying ? "almost there" : "thank you"}
          </p>
          <h1 className="mt-4 font-display text-[40px] lowercase leading-[1.05] text-maroon md:text-6xl">
            {stillVerifying
              ? "we're confirming your order"
              : "your order is placed."}
          </h1>
          <p className="mt-5 max-w-md text-base leading-7 text-charcoal/65">
            {stillVerifying
              ? "your payment is still being verified. we'll automatically update your order status once confirmation is received."
              : SUPPORT_NOTE}
          </p>
        </header>

        <div className="fade-rise-late mt-10 rounded-[28px] border border-cocoa/12 bg-cream/85 p-6 shadow-[0_18px_55px_rgba(43,38,35,0.06)] backdrop-blur-sm md:mt-12 md:p-9">
          <DetailRow label="order id" value={orderNumber} mono />

          {shipping ? (
            <DetailRow
              label="shipping to"
              icon={<MapPin className="h-4 w-4 text-cocoa" aria-hidden="true" />}
            >
              <p className="text-base leading-7 text-charcoal/80">
                {shipping.fullName}
                <br />
                {shipping.line1}
                {shipping.line2 ? (
                  <>
                    <br />
                    {shipping.line2}
                  </>
                ) : null}
                <br />
                {shipping.city}, {shipping.state} {shipping.pincode}
                <br />
                <span className="text-sm text-charcoal/55">
                  {shipping.phone}
                </span>
              </p>
            </DetailRow>
          ) : null}

          <DetailRow
            label="payment method"
            icon={<ShieldCheck className="h-4 w-4 text-cocoa" aria-hidden="true" />}
            value="Razorpay · secure online payment"
          />

          {!hasDetail ? (
            <p className="mt-6 rounded-2xl border border-cocoa/12 bg-cocoa/5 px-5 py-4 text-sm leading-6 text-charcoal/65">
              Full order details have been sent to your email. Sign in or create
              an account with the same email to view your orders here later.
            </p>
          ) : null}
        </div>

        <div className="mt-10 grid gap-3 sm:grid-cols-2">
          <Link
            href="/shop"
            className="group/cta flex min-h-[56px] items-center justify-center rounded-2xl border border-cocoa/24 bg-cream px-6 shadow-[0_14px_34px_rgba(140,106,90,0.14)] transition duration-700 hover:bg-cocoa/12"
          >
            <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.24em] text-cocoa">
              continue shopping
              <ArrowRight
                className="h-4 w-4 transition-transform duration-500 group-hover/cta:translate-x-1"
                aria-hidden="true"
              />
            </span>
          </Link>
          <Link
            href="/account/orders"
            className="group/cta flex min-h-[56px] items-center justify-center rounded-2xl bg-maroon px-6 shadow-[0_18px_40px_rgba(74,31,31,0.22)] transition duration-700 hover:bg-maroon/90 hover:shadow-[0_22px_52px_rgba(74,31,31,0.3)]"
          >
            <span className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.24em] text-cream">
              view orders
              <ArrowRight
                className="h-4 w-4 transition-transform duration-500 group-hover/cta:translate-x-1"
                aria-hidden="true"
              />
            </span>
          </Link>
        </div>
      </div>
    </section>
  );
}

function SuccessMark() {
  return (
    <div className="relative flex h-24 w-24 items-center justify-center">
      <span
        aria-hidden="true"
        className="absolute inset-0 rounded-full bg-cocoa/12 animate-[ping_2.6s_cubic-bezier(0,0,0.2,1)_infinite]"
      />
      <span
        aria-hidden="true"
        className="absolute inset-3 rounded-full bg-cocoa/15 animate-[ping_2.6s_cubic-bezier(0,0,0.2,1)_infinite] [animation-delay:700ms]"
      />
      <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-maroon shadow-[0_18px_40px_rgba(74,31,31,0.22)]">
        <Check
          className="h-6 w-6 text-cream"
          aria-hidden="true"
          strokeWidth={2.4}
        />
      </span>
    </div>
  );
}

interface DetailRowProps {
  label: string;
  value?: string;
  icon?: React.ReactNode;
  mono?: boolean;
  children?: React.ReactNode;
}
function DetailRow({ label, value, icon, mono, children }: DetailRowProps) {
  return (
    <div className="border-b border-cocoa/10 py-5 first:pt-0 last:border-b-0 last:pb-0">
      <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-charcoal/55">
        {icon}
        <span>{label}</span>
      </div>
      {value ? (
        <p
          className={`mt-2 text-base text-charcoal/85 ${
            mono ? "font-medium tracking-wider tabular-nums" : ""
          }`}
        >
          {value}
        </p>
      ) : null}
      {children ? <div className="mt-2">{children}</div> : null}
    </div>
  );
}
