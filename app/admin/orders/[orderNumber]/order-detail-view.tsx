"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import { Truck, Package, FileDown, RefreshCw } from "lucide-react";
import { StatusPill } from "@/components/admin/admin-primitives";
import {
  attachAwbNumber,
  createDelhiveryShipment,
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

// Mirrors FORWARD_TRANSITIONS in lib/actions/admin/orders.ts — the dropdown
// must only ever offer moves the server will actually accept. "returned"
// isn't reachable from here at all (it flows through the returns table).
const FORWARD_TRANSITIONS: Record<FulfillmentStatus, FulfillmentStatus[]> = {
  pending: ["processing", "cancelled"],
  processing: ["shipped", "cancelled"],
  shipped: ["out_for_delivery"],
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
  shippingAddress: unknown;
  billingAddress: unknown;
  invoiceNumber: string | null;
  items: OrderItem[];
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
  const [awbInput, setAwbInput] = useState(order.awbNumber ?? "");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const shipping = order.shippingAddress as Address | null;

  const canCreateShipment =
    order.paymentStatus === "paid" &&
    !order.awbNumber &&
    (order.fulfillmentStatus === "processing" ||
      order.fulfillmentStatus === "pending");

  const shipmentReason = !order.awbNumber
    ? order.paymentStatus !== "paid"
      ? "order is not paid yet"
      : order.fulfillmentStatus !== "processing" &&
          order.fulfillmentStatus !== "pending"
        ? `order is ${order.fulfillmentStatus.replace(/_/g, " ")}`
        : null
    : `already has AWB ${order.awbNumber}`;

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

  function handleAttachAwb() {
    const trimmed = awbInput.trim();
    if (!trimmed) return;
    startTransition(async () => {
      try {
        const updated = await attachAwbNumber(order.id, trimmed);
        setOrder((o) => ({
          ...o,
          awbNumber: updated.awbNumber ?? trimmed,
          fulfillmentStatus:
            updated.fulfillmentStatus as FulfillmentStatus,
        }));
        announce(`AWB attached${updated.fulfillmentStatus === "shipped" ? " · status → shipped" : ""}.`);
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
                    sku {item.sku} · qty {item.quantity}
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
            <Row label="subtotal" value={formatINR(order.subtotal)} />
            {order.discount > 0 ? (
              <Row
                label={`discount${order.couponCode ? ` (${order.couponCode})` : ""}`}
                value={`− ${formatINR(order.discount)}`}
              />
            ) : null}
            <Row label="shipping" value={formatINR(order.shippingFee)} />
            <div className="mt-1 border-t border-cocoa/10 pt-3">
              <Row label="total" value={formatINR(order.total)} strong />
            </div>
            <p className="mt-1 text-xs text-charcoal/55">
              status · {order.paymentStatus}
              {order.invoiceNumber ? ` · invoice ${order.invoiceNumber}` : ""}
            </p>
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
            <label className="block">
              <span className="block text-[11px] font-medium uppercase tracking-[0.16em] text-charcoal/55">
                awb number
              </span>
              <div className="mt-1.5 grid grid-cols-[1fr_auto] gap-2">
                <input
                  value={awbInput}
                  onChange={(e) => setAwbInput(e.target.value)}
                  placeholder="paste awb from delhivery"
                  className="rounded-xl border border-cocoa/20 bg-cream px-4 py-2.5 text-sm text-charcoal outline-none transition duration-500 focus:border-cocoa"
                />
                <button
                  type="button"
                  onClick={handleAttachAwb}
                  disabled={
                    pending ||
                    awbInput.trim().length === 0 ||
                    awbInput.trim() === order.awbNumber
                  }
                  className="rounded-full border border-cocoa/22 bg-cream px-4 text-[11px] font-medium uppercase tracking-[0.18em] text-cocoa transition duration-500 hover:border-cocoa disabled:opacity-50"
                >
                  attach
                </button>
              </div>
            </label>
            <p className="mt-1 text-xs text-charcoal/50">
              Use this when the shipment was created manually. Auto-advances
              to shipped when currently processing.
            </p>
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
        </Card>

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
