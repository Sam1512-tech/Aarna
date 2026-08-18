"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updateReturnStatus } from "@/lib/actions/admin/returns";
import { actionErrorMessage } from "@/lib/action-error";
import { ReturnRejectPicker } from "@/components/admin/return-reject-picker";
import type { RejectReason } from "@/lib/returns/reject-reasons";

const STATUSES = [
  "requested",
  "approved",
  "rejected",
  "picked",
  "received",
  "refund_pending",
  "refunded",
  "exchange_shipped",
  "exchange_delivered",
] as const;
type ReturnStatus = (typeof STATUSES)[number];

// "refunded" is only reachable through ReturnQcPanel → markReturnQc, which
// actually issues the Razorpay refund (or, for an exchange, approves the
// swap). "refund_pending" (COD only) is the same action's other outcome —
// parked awaiting RecordCodRefundTrigger → recordCodRefundSent, never
// manually settable either. "exchange_shipped"/"exchange_delivered" are
// only reachable through createExchangeShipment and the Delhivery status
// sync respectively. All four are excluded from the manual dropdown so an
// admin can't flip a return into a state that claims money moved or a real
// shipment exists when neither actually happened.
const SELECTABLE_STATUSES = STATUSES.filter(
  (s) =>
    s !== "refund_pending" &&
    s !== "refunded" &&
    s !== "exchange_shipped" &&
    s !== "exchange_delivered",
);
type SelectableStatus = (typeof SELECTABLE_STATUSES)[number];

const TONE_CLASS: Record<ReturnStatus, string> = {
  requested: "border-cocoa/22 bg-cream text-charcoal/70",
  approved: "border-cocoa/25 bg-cocoa/8 text-cocoa",
  rejected: "border-burnt-red/30 bg-burnt-red/8 text-burnt-red",
  picked: "border-cocoa/25 bg-cocoa/8 text-cocoa",
  received: "border-cocoa/25 bg-cocoa/8 text-cocoa",
  refund_pending: "border-cocoa/25 bg-cocoa/8 text-cocoa",
  refunded: "border-cocoa/30 bg-cocoa/12 text-cocoa",
  exchange_shipped: "border-cocoa/30 bg-cocoa/12 text-cocoa",
  exchange_delivered: "border-maroon/25 bg-maroon/6 text-maroon",
};

const LABEL: Record<ReturnStatus, string> = {
  requested: "requested",
  approved: "approved",
  rejected: "rejected",
  picked: "picked up",
  received: "received",
  refund_pending: "refund pending",
  refunded: "refunded",
  exchange_shipped: "swap shipped",
  exchange_delivered: "swap delivered",
};

/**
 * Live status control — changing calls updateReturnStatus immediately.
 * Optimistic update, rolled back on failure. Guards destructive transitions
 * (reject) with a browser confirm.
 */
export function ReturnStatusSelect({
  returnId,
  status,
}: {
  returnId: string;
  status: ReturnStatus;
}) {
  const router = useRouter();
  const [current, setCurrent] = useState<ReturnStatus>(status);
  const [prevStatus, setPrevStatus] = useState<ReturnStatus>(status);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showReject, setShowReject] = useState(false);

  // The QC panel (a sibling component) can move this return to "refunded"
  // via its own server action + router.refresh() — this component has no
  // way to know that happened except by picking up the new server-provided
  // status prop. Adjusted during render (not an effect) per React's
  // "resetting state when a prop changes" pattern.
  if (status !== prevStatus) {
    setPrevStatus(status);
    setCurrent(status);
  }

  function commitStatus(next: SelectableStatus) {
    const previous = current;
    setCurrent(next);
    setError(null);
    startTransition(async () => {
      try {
        await updateReturnStatus(returnId, next);
        router.refresh();
      } catch (err) {
        setCurrent(previous);
        setError(actionErrorMessage(err, "Couldn't update status"));
      }
    });
  }

  function handleChange(next: SelectableStatus) {
    if (next === current) return;
    if (next === "rejected") {
      setShowReject(true);
      return;
    }
    commitStatus(next);
  }

  async function handleReject(payload: { reason: RejectReason; note?: string }) {
    try {
      await updateReturnStatus(returnId, "rejected", {
        rejectionReason: payload.reason,
        adminNote: payload.note,
      });
      setCurrent("rejected");
      setShowReject(false);
      router.refresh();
    } catch (err) {
      throw new Error(actionErrorMessage(err, "Couldn't reject"));
    }
  }

  // Terminal (or automation-only) states — "refunded"/"refund_pending" are
  // only reachable via ReturnQcPanel, "exchange_shipped"/"exchange_delivered"
  // only via createExchangeShipment and the Delhivery status sync, and a
  // rejected request isn't reopened from here. Show a fixed pill instead of
  // a dropdown that implies more transitions are possible.
  if (
    current === "refund_pending" ||
    current === "refunded" ||
    current === "rejected" ||
    current === "exchange_shipped" ||
    current === "exchange_delivered"
  ) {
    return (
      <span
        className={`rounded-full border px-3 py-1 text-[10px] font-medium uppercase tracking-[0.16em] ${TONE_CLASS[current]}`}
      >
        {LABEL[current]}
      </span>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <select
        value={current}
        disabled={pending}
        onChange={(e) => handleChange(e.target.value as SelectableStatus)}
        aria-label="Return status"
        className={`rounded-full border px-3 py-1 text-base font-medium uppercase tracking-[0.16em] outline-none transition duration-300 focus-visible:ring-2 focus-visible:ring-cocoa/40 disabled:opacity-50 sm:text-[10px] ${TONE_CLASS[current]}`}
      >
        {SELECTABLE_STATUSES.map((s) => (
          <option key={s} value={s}>
            {LABEL[s]}
          </option>
        ))}
      </select>
      {error ? (
        <p className="max-w-40 text-right text-[10px] text-burnt-red">
          {error}
        </p>
      ) : null}
      {showReject ? (
        <ReturnRejectPicker
          onReject={handleReject}
          onCancel={() => setShowReject(false)}
        />
      ) : null}
    </div>
  );
}
