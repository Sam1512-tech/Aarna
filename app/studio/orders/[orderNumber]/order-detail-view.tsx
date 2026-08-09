"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import { Truck, Package, FileDown, Mail, RefreshCw } from "lucide-react";
import { StatusPill } from "@/components/admin/admin-primitives";
import {
  attachAwbNumber,
  createDelhiveryShipment,
  resendOrderConfirmationEmail,
  updateOrderFulfillmentStatus,
} from "@/lib/actions/admin/orders";
import { formatINR } from "@/lib/utils";
import { actionErrorMessage } from "@/lib/action-error";

type FulfillmentStatus =
  | "pending"
  | "processing"
  | "shipped"
  | "out_for_delivery"
  | "delivered"
  | "cancelled"
  | "returned";

// Mirrors FORWARD_TRANSITIONS in lib/orders/fulfillment-transitions.ts — the
// dropdown must only ever offer moves the server will actually accept.
// "returned" isn't reachable from here at all (it flows through the returns
// table). "shipped" -> "delivered" directly (skipping "out_for_delivery") is
// included so an admin can correct a stuck order by hand — e.g. a customer
// calls to confirm delivery but the courier's own "out for delivery" webhook
// never reached us either — without needing dev intervention.
const FORWARD_TRANSITIONS: Record<FulfillmentStatus, FulfillmentStatus[]> = {
  pending: ["processing", "cancelled"],
  processing: ["shipped", "cancelled"],
  shipped: ["out_for_delivery", "delivered"],
  out_for_delivery: ["delivered"],
  delivered: [],
  cancelled: [],
  returned: [],
};

interface OrderItem {
  id: string;
  variantId: string;
  productTitle: string;
  variantLabel: string | null;
  sku: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  imageUrl: string | null;
}

interface Order {
  id: string;
  orderNumber: string;
  paymentStatus: string;
  fulfillmentStatus: FulfillmentStatus;
  awbNumber: string | null;
  subtotal: number;
  shippingFee: number;
  discount: number;
  total: number;
  couponCode: string | null;
  email: string;
  phone: string;
  gstNumber: string | null;
  shippingAddress: unknown;
  billingAddress: unknown;
  invoiceNumber: string | null;
  items: OrderItem[];
  creditNotes: CreditNote[];
}

interface CreditNote {
  id: string;
  creditNoteNumber: string;
  refundedAmount: number;
  createdAt: string;
  needsReview: boolean;
}

interface Address {
  fullName?: string;
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  pincode?: string;
  phone?: string;
}

function toneForFulfillment(s: FulfillmentStatus) {
  if (s === "delivered") return "ok" as const;
  if (s === "cancelled" || s === "returned") return "bad" as const;
  if (s === "shipped" || s === "out_for_delivery") return "warn" as const;
  return "muted" as const;
}

export function OrderDetailView({ order: initial }: { order: Order }) {
  const [order, setOrder] = useState(initial);
  // "PENDING" is an internal sentinel (createDelhiveryShipment's in-flight
  // claim), never a real AWB to show/resubmit — start the input blank for
  // that case rather than literally pre-filling the word "PENDING".
  const [awbInput, setAwbInput] = useState(
    order.awbNumber && order.awbNumber !== "PENDING" ? order.awbNumber : "",
  );
  // Separate from the normal "attach" flow — only reachable once a real AWB
  // already exists, and only after an explicit confirmation. See
  // handleAttachAwb / lib/actions/admin/orders.ts's attachAwbNumber for why
  // this can't just be the same button: silently overwriting an existing
  // AWB is exactly the bug that corrupted AARNA-001034's awb_number into
  // two waybills concatenated together.
  const [replacingAwb, setReplacingAwb] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const hasRealAwb = !!order.awbNumber && order.awbNumber !== "PENDING";

  const shipping = order.shippingAddress as Address | null;

  const canCreateShipment =
    order.paymentStatus === "paid" &&
    !order.awbNumber &&
    (order.fulfillmentStatus === "processing" ||
      order.fulfillmentStatus === "pending");

  const shipmentReason = !order.awbNumber
    ? order.paymentStatus !== "paid"
      ? "Order is not paid yet"
      : order.fulfillmentStatus !== "processing" &&
          order.fulfillmentStatus !== "pending"
        ? `Order is ${order.fulfillmentStatus.replace(/_/g, " ")}`
        : null
    : order.awbNumber === "PENDING"
      ? "Shipment creation is already in progress for this order"
      : `Already has AWB ${order.awbNumber}`;

  function announce(msg: string, isError = false) {
    if (isError) {
      setError(msg);
      setNotice(null);
    } else {
      setNotice(msg);
      setError(null);
    }
  }

  function handleStatusChange(next: FulfillmentStatus) {
    if (next === order.fulfillmentStatus) return;
    startTransition(async () => {
      try {
        const updated = await updateOrderFulfillmentStatus(order.id, next);
        setOrder((o) => ({ ...o, fulfillmentStatus: updated.fulfillmentStatus }));
        announce(`Status set to ${next.replace(/_/g, " ")}.`);
      } catch (err) {
        announce(
          actionErrorMessage(err, "Couldn't update status"),
          true,
        );
      }
    });
  }

  function handleAttachAwb(replace: boolean) {
    const trimmed = awbInput.trim();
    if (!trimmed) return;
    if (replace) {
      const confirmed = window.confirm(
        `Replace the existing AWB (${order.awbNumber}) with "${trimmed}"? This only updates Aarna's record — it does not cancel any real shipment already booked with Delhivery under the old AWB.`,
      );
      if (!confirmed) return;
    }
    startTransition(async () => {
      try {
        const updated = await attachAwbNumber(order.id, trimmed, { replace });
        setOrder((o) => ({
          ...o,
          awbNumber: updated.awbNumber ?? trimmed,
          fulfillmentStatus:
            updated.fulfillmentStatus as FulfillmentStatus,
        }));
        setReplacingAwb(false);
        announce(`AWB ${replace ? "replaced" : "attached"}${updated.fulfillmentStatus === "shipped" ? " · status → shipped" : ""}.`);
      } catch (err) {
        announce(actionErrorMessage(err, "Couldn't attach AWB"), true);
      }
    });
  }

  function handleCreateShipment() {
    if (!canCreateShipment) return;
    startTransition(async () => {
      try {
        const updated = await createDelhiveryShipment(order.id);
        setOrder((o) => ({
          ...o,
          awbNumber: updated.awbNumber ?? o.awbNumber,
          fulfillmentStatus:
            (updated.fulfillmentStatus as FulfillmentStatus) ??
            o.fulfillmentStatus,
        }));
        if (updated.awbNumber) setAwbInput(updated.awbNumber);
        announce("Shipment created — AWB saved and order moved to shipped.");
      } catch (err) {
        announce(
          actionErrorMessage(err, "Couldn't create shipment"),
          true,
        );
      }
    });
  }

  function handleResendConfirmation() {
    startTransition(async () => {
      try {
        await resendOrderConfirmationEmail(order.id);
        announce(`Confirmation email resent to ${order.email}.`);
      } catch (err) {
        announce(actionErrorMessage(err, "Couldn't resend confirmation email"), true);
      }
    });
  }

  const canResendConfirmation =
    (order.paymentStatus === "paid" || order.paymentStatus === "partially_refunded") &&
    Boolean(order.invoiceNumber);

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[1.55fr_0.9fr]">
      {/* Items + address column */}
      <div className="space-y-6">
        <Card>
          <SectionTitle>Items</SectionTitle>
          <ul className="mt-4 divide-y divide-cocoa/10">
            {order.items.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-4 py-4 first:pt-0 last:pb-0"
              >
                <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-cocoa/6">
                  {item.imageUrl ? (
                    <Image
                      src={item.imageUrl}
                      alt={item.productTitle}
                      fill
                      sizes="64px"
                      className="object-cover"
                    />
                  ) : (
                    <Package
                      className="absolute inset-0 m-auto h-5 w-5 text-cocoa/40"
                      aria-hidden="true"
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-charcoal">
                    {item.productTitle}
                  </p>
                  <p className="text-xs text-charcoal/55">
                    {item.variantLabel ? `${item.variantLabel} · ` : ""}
                    SKU {item.sku} · qty {item.quantity}
                  </p>
                </div>
                <div className="text-right text-sm tabular-nums">
                  <p className="font-medium text-charcoal">
                    {formatINR(item.lineTotal)}
                  </p>
                  <p className="text-xs text-charcoal/50">
                    {formatINR(item.unitPrice)} × {item.quantity}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <SectionTitle>Delivery address</SectionTitle>
          {shipping ? (
            <address className="mt-3 not-italic text-sm leading-6 text-charcoal/80">
              {shipping.fullName ? (
                <p className="font-medium text-charcoal">
                  {shipping.fullName}
                </p>
              ) : null}
              {shipping.line1 ? <p>{shipping.line1}</p> : null}
              {shipping.line2 ? <p>{shipping.line2}</p> : null}
              {shipping.city || shipping.state || shipping.pincode ? (
                <p>
                  {[shipping.city, shipping.state, shipping.pincode]
                    .filter(Boolean)
                    .join(", ")}
                </p>
              ) : null}
              {shipping.phone ? (
                <p className="mt-2 text-charcoal/60">tel {shipping.phone}</p>
              ) : null}
            </address>
          ) : (
            <p className="mt-2 text-sm text-charcoal/50">
              No shipping address on file.
            </p>
          )}
          <p className="mt-3 text-xs text-charcoal/55">
            {order.email}
            {order.phone ? ` · ${order.phone}` : ""}
          </p>
        </Card>

        <Card>
          <SectionTitle>Payment</SectionTitle>
          <div className="mt-4 grid gap-3 text-sm">
            <Row label="Subtotal" value={formatINR(order.subtotal)} />
            {order.discount > 0 ? (
              <Row
                label={`discount${order.couponCode ? ` (${order.couponCode})` : ""}`}
                value={`− ${formatINR(order.discount)}`}
              />
            ) : null}
            <Row label="Shipping" value={formatINR(order.shippingFee)} />
            <div className="mt-1 border-t border-cocoa/10 pt-3">
              <Row label="Total" value={formatINR(order.total)} strong />
            </div>
            <p className="mt-1 text-xs text-charcoal/55">
              status · {order.paymentStatus}
              {order.invoiceNumber ? ` · invoice ${order.invoiceNumber}` : ""}
            </p>
            {order.gstNumber ? (
              <p className="text-xs text-charcoal/55">
                buyer GSTIN · <span className="font-mono">{order.gstNumber}</span>
              </p>
            ) : null}
          </div>
        </Card>
      </div>

      {/* Actions column */}
      <aside className="space-y-6 lg:sticky lg:top-6 lg:self-start">
        <Card>
          <div className="flex items-center justify-between">
            <SectionTitle>Fulfillment</SectionTitle>
            <StatusPill
              label={order.fulfillmentStatus.replace(/_/g, " ")}
              tone={toneForFulfillment(order.fulfillmentStatus)}
            />
          </div>

          <label className="mt-4 block">
            <span className="block text-[11px] font-medium uppercase tracking-[0.16em] text-charcoal/55">
              set status
            </span>
            <select
              value={order.fulfillmentStatus}
              onChange={(e) =>
                handleStatusChange(e.target.value as FulfillmentStatus)
              }
              disabled={pending || FORWARD_TRANSITIONS[order.fulfillmentStatus].length === 0}
              className="mt-1.5 block w-full rounded-xl border border-cocoa/20 bg-cream px-4 py-2.5 text-sm text-charcoal outline-none transition duration-500 focus:border-cocoa disabled:opacity-60"
            >
              <option value={order.fulfillmentStatus}>
                {order.fulfillmentStatus.replaceAll("_", " ")}
              </option>
              {FORWARD_TRANSITIONS[order.fulfillmentStatus].map((s) => (
                <option key={s} value={s}>
                  {s.replaceAll("_", " ")}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-charcoal/50">
              {FORWARD_TRANSITIONS[order.fulfillmentStatus].length === 0
                ? "This is a final status — nothing to move it to from here."
                : "Only shows moves that are actually valid from here."}
            </p>
          </label>
        </Card>

        <Card>
          <SectionTitle>Shipment</SectionTitle>
          <button
            type="button"
            onClick={handleCreateShipment}
            disabled={!canCreateShipment || pending}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-cocoa px-5 py-2.5 text-[11px] font-medium uppercase tracking-[0.18em] text-cream shadow-[0_10px_28px_rgba(140,106,90,0.22)] transition duration-500 hover:bg-cocoa/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Truck className="h-3.5 w-3.5" aria-hidden="true" />
            {pending ? "working…" : "create shipment"}
          </button>
          {shipmentReason ? (
            <p className="mt-2 text-xs text-charcoal/55">{shipmentReason}</p>
          ) : (
            <p className="mt-2 text-xs text-charcoal/55">
              Books a Delhivery pickup, saves the AWB, moves the order to
              shipped.
            </p>
          )}

          <div className="mt-5 border-t border-cocoa/10 pt-4">
            {hasRealAwb && !replacingAwb ? (
              <>
                <span className="block text-[11px] font-medium uppercase tracking-[0.16em] text-charcoal/55">
                  awb number
                </span>
                <p className="mt-1.5 rounded-xl border border-cocoa/20 bg-cocoa/5 px-4 py-2.5 text-sm text-charcoal">
                  {order.awbNumber}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setAwbInput("");
                    setReplacingAwb(true);
                  }}
                  className="soft-link mt-2 text-[11px] font-medium uppercase tracking-[0.16em] text-charcoal/55"
                >
                  Replace shipment…
                </button>
                <p className="mt-1 text-xs text-charcoal/50">
                  A shipment is already attached. Only replace it to correct
                  a mistake — this doesn&apos;t cancel any real shipment
                  already booked with Delhivery under the old AWB.
                </p>
              </>
            ) : (
              <label className="block">
                <span className="block text-[11px] font-medium uppercase tracking-[0.16em] text-charcoal/55">
                  {replacingAwb ? "new awb number" : "awb number"}
                </span>
                {replacingAwb ? (
                  <p className="mt-1 text-xs text-burnt-red">
                    Replacing the existing AWB ({order.awbNumber}) — updates
                    Aarna&apos;s record only.
                  </p>
                ) : null}
                <div className="mt-1.5 grid grid-cols-[1fr_auto] gap-2">
                  <input
                    value={awbInput}
                    onChange={(e) => setAwbInput(e.target.value)}
                    placeholder="Paste AWB from Delhivery"
                    className="rounded-xl border border-cocoa/20 bg-cream px-4 py-2.5 text-sm text-charcoal outline-none transition duration-500 focus:border-cocoa"
                  />
                  <button
                    type="button"
                    onClick={() => handleAttachAwb(replacingAwb)}
                    disabled={
                      pending ||
                      awbInput.trim().length === 0 ||
                      (!replacingAwb && awbInput.trim() === order.awbNumber)
                    }
                    className="rounded-full border border-cocoa/22 bg-cream px-4 text-[11px] font-medium uppercase tracking-[0.18em] text-cocoa transition duration-500 hover:border-cocoa disabled:opacity-50"
                  >
                    {replacingAwb ? "replace" : "attach"}
                  </button>
                </div>
                {replacingAwb ? (
                  <button
                    type="button"
                    onClick={() => {
                      setReplacingAwb(false);
                      setAwbInput("");
                    }}
                    className="mt-2 text-[11px] font-medium uppercase tracking-[0.16em] text-charcoal/45 transition duration-500 hover:text-charcoal/70"
                  >
                    cancel
                  </button>
                ) : (
                  <p className="mt-1 text-xs text-charcoal/50">
                    Use this when the shipment was created manually.
                    Auto-advances to shipped when currently processing.
                  </p>
                )}
              </label>
            )}
          </div>
        </Card>

        <Card>
          <SectionTitle>Invoice</SectionTitle>
          <a
            href={`/api/admin/orders/${order.id}/invoice.pdf`}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full border border-cocoa/22 bg-cream px-5 py-2.5 text-[11px] font-medium uppercase tracking-[0.18em] text-cocoa transition duration-500 hover:border-cocoa"
            target="_blank"
            rel="noreferrer"
          >
            <FileDown className="h-3.5 w-3.5" aria-hidden="true" />
            download tax invoice
          </a>
          <p className="mt-2 text-xs text-charcoal/50">
            Regenerates the GST invoice PDF from current order data.
          </p>

          {canResendConfirmation ? (
            <>
              <button
                type="button"
                onClick={handleResendConfirmation}
                disabled={pending}
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full border border-cocoa/22 bg-cream px-5 py-2.5 text-[11px] font-medium uppercase tracking-[0.18em] text-cocoa transition duration-500 hover:border-cocoa disabled:opacity-50"
              >
                <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                resend confirmation email
              </button>
              <p className="mt-2 text-xs text-charcoal/50">
                Re-sends the order confirmation with the invoice PDF
                attached — use this if a customer says they never got it.
              </p>
            </>
          ) : null}
        </Card>

        {order.creditNotes.length > 0 ? (
          <Card>
            <SectionTitle>Credit Notes</SectionTitle>
            <p className="mt-2 text-xs text-charcoal/50">
              Issued automatically whenever a refund is processed for this
              order — one per refund event, for GST filing.
            </p>
            <div className="mt-3 space-y-2">
              {order.creditNotes.map((cn) => (
                <div
                  key={cn.id}
                  className="rounded-xl border border-cocoa/18 p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-charcoal">
                      {cn.creditNoteNumber}
                    </span>
                    <span className="text-sm text-charcoal/70">
                      {formatINR(cn.refundedAmount)}
                    </span>
                  </div>
                  {cn.needsReview ? (
                    <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.14em] text-burnt-red">
                      Needs review — estimated GST split
                    </p>
                  ) : null}
                  <a
                    href={`/api/admin/credit-notes/${cn.id}/pdf`}
                    className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-cocoa transition duration-500 hover:text-maroon"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <FileDown className="h-3 w-3" aria-hidden="true" />
                    download credit note
                  </a>
                </div>
              ))}
            </div>
          </Card>
        ) : null}

        {notice ? (
          <p className="inline-flex items-center gap-2 text-xs text-cocoa">
            <RefreshCw className="h-3 w-3" aria-hidden="true" />
            {notice}
          </p>
        ) : null}
        {error ? (
          <p className="text-xs text-burnt-red">{error}</p>
        ) : null}
      </aside>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-cocoa/12 bg-cream p-5 shadow-[0_10px_28px_rgba(43,38,35,0.04)] md:p-6">
      {children}
    </section>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-display text-xl uppercase text-maroon">{children}</h2>
  );
}

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-charcoal/60">{label}</span>
      <span
        className={`tabular-nums ${strong ? "font-display text-lg text-maroon" : "text-charcoal"}`}
      >
        {value}
      </span>
    </div>
  );
}
