"use client";

import { useMemo, useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Check, Plus, RotateCcw } from "lucide-react";
import {
  ReturnExchangeModal,
  type SubmittedRow,
} from "@/components/storefront/return-exchange-modal";
import { formatINR } from "@/lib/utils";

export interface ReturnRow {
  id: string;
  orderNumber: string;
  productTitle: string;
  variantLabel: string | null;
  quantity: number;
  reason: string;
  type: "return" | "exchange";
  status: string;
  refundAmount: number | null;
  createdAt: Date | string;
  /** Outbound replacement shipment AWB — null until it's actually shipped. */
  outboundAwb: string | null;
  /** Reverse pickup AWB (customer -> studio leg) — null until arranged. */
  reversePickupAwb: string | null;
  /** Optional — a freshly-submitted row (handleSubmitted below) never needs
   *  this, since it starts at "requested" and none of the paymentMethod-
   *  dependent messaging below renders before "refund_pending"/"refunded". */
  paymentMethod?: "prepaid" | "cod";
  /** Where a pending COD refund is headed — only set for a COD return. */
  refundUpiId?: string | null;
}

export interface EligibleItem {
  orderItemId: string;
  orderNumber: string;
  productId: string;
  variantId: string;
  productTitle: string;
  variantLabel: string | null;
  quantity: number;
  lineTotal: number;
  paymentMethod: "prepaid" | "cod";
}

interface AccountReturnsViewProps {
  returns: ReturnRow[];
  eligibleItems: EligibleItem[];
}

type Tab = "all" | "returns" | "exchanges";
type Type = "return" | "exchange";

// Every status either timeline can show — declared as one explicit union
// (not derived from either array below) so RETURN_STEPS and EXCHANGE_STEPS
// can each independently list only the states relevant to that type without
// one having to be a subset of the other.
type Step =
  | "requested"
  | "approved"
  | "picked"
  | "received"
  | "refund_pending"
  | "refunded"
  | "exchange_shipped"
  | "exchange_delivered";

// Same enum keys backend uses in lib/db/schema.ts. Returns and exchanges
// diverge after "received" — a return's last real milestone is the refund
// (with refund_pending as an extra in-between step for a COD return awaiting
// its manual UPI transfer — an exchange never reaches it, its own refund is
// always 0); an exchange's is the replacement actually arriving, two steps
// later (shipped, delivered), with "refunded" (QC passed, not yet shipped)
// as an in-between step exchanges have and returns don't.
// Two variants of the return timeline — refund_pending is a real, distinct
// status only a COD return's status column ever actually holds (markReturnQc
// sends prepaid returns straight to "refunded", never through
// refund_pending). Showing the COD-only step for a prepaid return would mark
// a milestone "done" that its own status history never passed through.
const RETURN_STEPS_PREPAID = [
  "requested",
  "approved",
  "picked",
  "received",
  "refunded",
] as const satisfies readonly Step[];
const RETURN_STEPS_COD = [
  "requested",
  "approved",
  "picked",
  "received",
  "refund_pending",
  "refunded",
] as const satisfies readonly Step[];
const EXCHANGE_STEPS = [
  "requested",
  "approved",
  "picked",
  "received",
  "refunded",
  "exchange_shipped",
  "exchange_delivered",
] as const satisfies readonly Step[];

function stepsFor(type: Type, paymentMethod?: "prepaid" | "cod"): readonly Step[] {
  if (type === "exchange") return EXCHANGE_STEPS;
  return paymentMethod === "cod" ? RETURN_STEPS_COD : RETURN_STEPS_PREPAID;
}

function stepLabel(step: Step, type: Type): string {
  switch (step) {
    case "requested":
      return "requested";
    case "approved":
      return "approved";
    case "picked":
      return "picked up";
    case "received":
      return "received";
    case "refund_pending":
      return "refund pending";
    case "refunded":
      return type === "exchange" ? "swap approved" : "refunded";
    case "exchange_shipped":
      return "shipped";
    case "exchange_delivered":
      return "delivered";
  }
}

function fmtDate(d: Date | string) {
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function AccountReturnsView({
  returns: initialReturns,
  eligibleItems,
}: AccountReturnsViewProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const tabFromUrl = searchParams.get("tab");
  const initialTab: Tab =
    tabFromUrl === "returns" || tabFromUrl === "exchanges" ? tabFromUrl : "all";

  const [tab, setTab] = useState<Tab>(initialTab);
  const [rows, setRows] = useState<ReturnRow[]>(initialReturns);
  const [modalOpen, setModalOpen] = useState(false);

  function switchTab(next: Tab) {
    setTab(next);
    const params = new URLSearchParams(searchParams.toString());
    if (next === "all") params.delete("tab");
    else params.set("tab", next);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const filtered = useMemo(() => {
    if (tab === "all") return rows;
    if (tab === "returns") return rows.filter((r) => r.type === "return");
    return rows.filter((r) => r.type === "exchange");
  }, [rows, tab]);

  const counts = useMemo(() => {
    const returnCount = rows.filter((r) => r.type === "return").length;
    const exchangeCount = rows.filter((r) => r.type === "exchange").length;
    return { all: rows.length, returns: returnCount, exchanges: exchangeCount };
  }, [rows]);

  function handleSubmitted(row: SubmittedRow) {
    setRows((prev) => [
      {
        id: row.id,
        orderNumber: row.orderNumber,
        productTitle: row.productTitle,
        variantLabel: row.variantLabel,
        quantity: row.quantity,
        reason: row.reason,
        type: row.type,
        status: row.status,
        refundAmount: row.refundAmount,
        createdAt: row.createdAt,
        outboundAwb: null,
        reversePickupAwb: null,
        paymentMethod: row.paymentMethod,
      },
      ...prev,
    ]);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-charcoal/55">
          returns & exchanges · {counts.all}
        </p>
        {eligibleItems.length > 0 ? (
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-full bg-maroon px-4 py-2 text-[11px] font-medium uppercase tracking-[0.18em] text-cream transition duration-500 hover:bg-maroon/90"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Raise a request
          </button>
        ) : null}
      </div>

      <div
        role="tablist"
        aria-label="Filter"
        className="mt-5 flex gap-2 border-b border-cocoa/12"
      >
        <TabButton
          active={tab === "all"}
          onClick={() => switchTab("all")}
          label="All"
          count={counts.all}
        />
        <TabButton
          active={tab === "returns"}
          onClick={() => switchTab("returns")}
          label="Returns"
          count={counts.returns}
        />
        <TabButton
          active={tab === "exchanges"}
          onClick={() => switchTab("exchanges")}
          label="Exchanges"
          count={counts.exchanges}
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState tab={tab} hasEligible={eligibleItems.length > 0} />
      ) : (
        <ul className="mt-6 space-y-4">
          {filtered.map((r) => (
            <RequestCard key={r.id} row={r} type={r.type} />
          ))}
        </ul>
      )}

      <ReturnExchangeModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        eligibleItems={eligibleItems}
        onSubmitted={handleSubmitted}
      />
    </div>
  );
}

function EmptyState({ tab, hasEligible }: { tab: Tab; hasEligible: boolean }) {
  const copy =
    tab === "exchanges"
      ? "No exchange requests yet"
      : tab === "returns"
        ? "No returns yet"
        : "No requests yet";
  const sub = hasEligible
    ? "Raise a request within 3 days of delivery."
    : "Nothing eligible right now — requests are open for 3 days after delivery.";
  return (
    <div className="mt-6 flex flex-col items-center rounded-2xl border border-cocoa/12 bg-cream/70 py-14 text-center">
      <span className="inline-flex h-14 w-14 items-center justify-center rounded-full border border-cocoa/20 text-cocoa">
        <RotateCcw className="h-5 w-5" aria-hidden="true" />
      </span>
      <h2 className="mt-5 font-display text-2xl text-maroon">
        {copy}
      </h2>
      <p className="mt-2 max-w-sm text-sm text-charcoal/60">{sub}</p>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`relative -mb-px flex items-center gap-2 px-4 py-3 text-[11px] font-medium uppercase tracking-[0.18em] transition duration-300 ${
        active
          ? "text-maroon"
          : "text-charcoal/50 hover:text-charcoal/80"
      }`}
    >
      {label}
      <span
        className={`rounded-full px-1.5 py-0.5 text-[9px] tabular-nums ${
          active ? "bg-maroon/12 text-maroon" : "bg-cocoa/8 text-charcoal/55"
        }`}
      >
        {count}
      </span>
      {active ? (
        <span
          aria-hidden="true"
          className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-maroon"
        />
      ) : null}
    </button>
  );
}

function RequestCard({
  row,
  type,
}: {
  row: ReturnRow;
  type: Type;
}) {
  const isRejected = row.status === "rejected";
  const steps = stepsFor(type, row.paymentMethod);
  const currentIdx = steps.findIndex((s) => s === row.status);
  const displayReason = row.reason;

  return (
    <li className="rounded-2xl border border-cocoa/12 bg-cream p-5 shadow-[0_10px_28px_rgba(43,38,35,0.04)] md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] ${
                type === "exchange"
                  ? "border-cocoa/30 bg-cocoa/8 text-cocoa"
                  : "border-maroon/25 bg-maroon/6 text-maroon"
              }`}
            >
              {type}
            </span>
            <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-charcoal/50">
              order · {row.orderNumber}
            </p>
          </div>
          <p className="mt-2 font-display text-xl text-maroon">
            {row.productTitle}
          </p>
          {row.variantLabel ? (
            <p className="mt-0.5 text-xs text-charcoal/55">
              {row.variantLabel} · Qty {row.quantity}
            </p>
          ) : null}
        </div>

        <div className="text-right">
          <p className="text-[10px] uppercase tracking-[0.16em] text-charcoal/50">
            raised {fmtDate(row.createdAt)}
          </p>
          {type === "return" && row.refundAmount ? (
            <p className="mt-1 text-sm">
              <span className="text-charcoal/55">Refund </span>
              <span className="font-medium text-cocoa">
                {formatINR(row.refundAmount)}
              </span>
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-cocoa/10 bg-cocoa/4 px-4 py-3">
        <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-charcoal/55">
          your note
        </p>
        <p className="mt-1 text-sm leading-6 text-charcoal/75">
          {displayReason || "—"}
        </p>
      </div>

      {isRejected ? (
        <div className="mt-4 rounded-xl border border-burnt-red/25 bg-burnt-red/6 px-4 py-3">
          <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-burnt-red">
            not approved
          </p>
          <p className="mt-1 text-sm leading-6 text-charcoal/75">
            Our team wasn&apos;t able to process this request. Reach out to
            hello@shopaarna.in with more details and we&apos;ll take another
            look.
          </p>
        </div>
      ) : (
        <Timeline currentIdx={currentIdx} type={type} steps={steps} />
      )}

      {row.reversePickupAwb && (row.status === "approved" || row.status === "picked") ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-cocoa/10 bg-cocoa/4 px-4 py-3">
          <p className="text-xs leading-6 text-charcoal/55">
            Pickup arranged — our courier will collect this from you.
          </p>
          <a
            href={`https://www.delhivery.com/track-v2/package/${encodeURIComponent(row.reversePickupAwb)}`}
            target="_blank"
            rel="noopener"
            className="soft-link text-[11px] font-bold uppercase tracking-[0.18em] text-cocoa"
          >
            Track pickup
          </a>
        </div>
      ) : null}

      {type === "return" && row.status === "refund_pending" && row.refundAmount ? (
        <p className="mt-4 text-xs leading-6 text-charcoal/55">
          Your {formatINR(row.refundAmount)} refund will be sent via UPI
          {row.refundUpiId ? ` to ${row.refundUpiId}` : ""} shortly.
        </p>
      ) : null}

      {type === "return" && row.status === "refunded" && row.refundAmount ? (
        <p className="mt-4 text-xs leading-6 text-charcoal/55">
          {row.paymentMethod === "cod"
            ? `${formatINR(row.refundAmount)} refunded via UPI.`
            : `${formatINR(row.refundAmount)} refunded to your original payment method — allow 5–7 business days for it to show up.`}
        </p>
      ) : null}

      {type === "exchange" && row.status === "refunded" ? (
        <p className="mt-4 text-xs leading-6 text-charcoal/55">
          Your replacement is being prepared — you&apos;ll see tracking here
          once it ships.
        </p>
      ) : null}

      {type === "exchange" && row.outboundAwb && row.status === "exchange_shipped" ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-cocoa/10 bg-cocoa/4 px-4 py-3">
          <p className="text-xs leading-6 text-charcoal/55">
            Your replacement has shipped.
          </p>
          <a
            href={`https://www.delhivery.com/track-v2/package/${encodeURIComponent(row.outboundAwb)}`}
            target="_blank"
            rel="noopener"
            className="soft-link text-[11px] font-bold uppercase tracking-[0.18em] text-cocoa"
          >
            Track shipment
          </a>
        </div>
      ) : null}

      {type === "exchange" && row.status === "exchange_delivered" ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-cocoa/10 bg-cocoa/4 px-4 py-3">
          <p className="text-xs leading-6 text-charcoal/55">
            Your replacement was delivered.
          </p>
          {row.outboundAwb ? (
            <a
              href={`https://www.delhivery.com/track-v2/package/${encodeURIComponent(row.outboundAwb)}`}
              target="_blank"
              rel="noopener"
              className="soft-link text-[11px] font-bold uppercase tracking-[0.18em] text-cocoa"
            >
              View tracking
            </a>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function Timeline({
  currentIdx,
  type,
  steps,
}: {
  currentIdx: number;
  type: Type;
  steps: readonly Step[];
}) {
  return (
    <ol
      aria-label="Status timeline"
      className="mt-4 flex flex-col gap-3 md:flex-row md:items-start md:gap-0"
    >
      {steps.map((step, i) => {
        const done = i < currentIdx;
        const active = i === currentIdx;
        return (
          <li
            key={step}
            className="relative flex items-center gap-3 md:flex-1 md:flex-col md:items-center md:gap-2"
          >
            <span
              aria-hidden="true"
              className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] tabular-nums transition duration-500 ${
                done
                  ? "bg-cocoa text-cream"
                  : active
                    ? "bg-maroon text-cream ring-4 ring-maroon/15"
                    : "border border-cocoa/22 text-charcoal/40"
              }`}
            >
              {done ? <Check className="h-3 w-3" /> : i + 1}
            </span>
            <span
              className={`text-[10px] font-medium uppercase tracking-[0.16em] ${
                active
                  ? "text-maroon"
                  : done
                    ? "text-cocoa"
                    : "text-charcoal/40"
              }`}
            >
              {stepLabel(step, type)}
            </span>

            {i < steps.length - 1 ? (
              <span
                aria-hidden="true"
                className={`absolute left-3 top-6 h-6 w-px md:left-auto md:top-3 md:h-px md:w-full md:translate-x-1/2 ${
                  done ? "bg-cocoa/45" : "bg-cocoa/15"
                }`}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
