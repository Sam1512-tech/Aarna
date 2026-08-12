"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { formatINR } from "@/lib/utils";

export interface ReturnQcPanelProps {
  refundAmount: number;
  /** Called with the QC outcome. On fail, `partialPercent` is the % of `refundAmount` to refund (0 = keep everything, 100 = full refund). */
  onSubmit: (payload: {
    outcome: "pass" | "fail";
    partialPercent?: number;
    note?: string;
  }) => Promise<void>;
  type: "return" | "exchange";
}

/**
 * Rendered in the admin row when a return reaches status='received'. Admin
 * inspects the item and either passes (triggers a refund for a return, or
 * approves the swap for an exchange — a ShipExchangeTrigger then appears to
 * actually book the outbound replacement shipment) or fails (with an
 * optional partial refund %).
 *
 * Wires to `markReturnQc()`.
 */
export function ReturnQcPanel({
  refundAmount,
  onSubmit,
  type,
}: ReturnQcPanelProps) {
  const [outcome, setOutcome] = useState<"pass" | "fail" | null>(null);
  const [partialPercent, setPartialPercent] = useState<number>(50);
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const partialAmount = Math.round((refundAmount * partialPercent) / 100);
  const canSubmit =
    outcome !== null &&
    !pending &&
    (outcome === "pass" || note.trim().length >= 10);

  function handleSubmit() {
    if (!canSubmit || !outcome) return;
    setError(null);
    startTransition(async () => {
      try {
        await onSubmit({
          outcome,
          partialPercent: outcome === "fail" ? partialPercent : undefined,
          note: note.trim() || undefined,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't submit QC");
      }
    });
  }

  const passLabel =
    type === "exchange" ? "Approve the swap" : `Refund ${formatINR(refundAmount)}`;

  return (
    <div className="mt-4 rounded-xl border border-cocoa/20 bg-cocoa/6 px-4 py-4 md:px-5 md:py-5">
      <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-charcoal/55">
        Quality check
      </p>
      <p className="mt-1 text-xs leading-5 text-charcoal/60">
        Item received — inspect and choose an outcome. This closes the request.
      </p>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setOutcome("pass")}
          aria-pressed={outcome === "pass"}
          className={`flex flex-col items-start gap-1.5 rounded-2xl border p-4 text-left transition duration-500 ${
            outcome === "pass"
              ? "border-cocoa bg-cocoa/12 shadow-[0_10px_28px_rgba(140,106,90,0.14)]"
              : "border-cocoa/20 bg-cream hover:border-cocoa"
          }`}
        >
          <span
            className={`inline-flex h-7 w-7 items-center justify-center rounded-full ${
              outcome === "pass"
                ? "bg-cocoa text-cream"
                : "border border-cocoa/25 text-cocoa"
            }`}
          >
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="text-sm font-medium text-charcoal/90">
            Pass — {passLabel}
          </span>
          <span className="text-[10px] uppercase tracking-[0.14em] text-charcoal/50">
            Piece is in resellable condition
          </span>
        </button>

        <button
          type="button"
          onClick={() => setOutcome("fail")}
          aria-pressed={outcome === "fail"}
          className={`flex flex-col items-start gap-1.5 rounded-2xl border p-4 text-left transition duration-500 ${
            outcome === "fail"
              ? "border-burnt-red bg-burnt-red/8 shadow-[0_10px_28px_rgba(122,59,50,0.14)]"
              : "border-cocoa/20 bg-cream hover:border-cocoa"
          }`}
        >
          <span
            className={`inline-flex h-7 w-7 items-center justify-center rounded-full ${
              outcome === "fail"
                ? "bg-burnt-red text-cream"
                : "border border-cocoa/25 text-cocoa"
            }`}
          >
            <XCircle className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="text-sm font-medium text-charcoal/90">
            Fail — partial or no refund
          </span>
          <span className="text-[10px] uppercase tracking-[0.14em] text-charcoal/50">
            Damaged, worn, or wrong item
          </span>
        </button>
      </div>

      {outcome === "fail" ? (
        <div className="mt-4 space-y-3 rounded-xl border border-cocoa/12 bg-cream/70 px-4 py-3">
          <div>
            <div className="flex items-baseline justify-between">
              <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-charcoal/55">
                Partial refund
              </p>
              <p className="text-xs text-charcoal/70">
                <span className="tabular-nums">{partialPercent}%</span>
                {" · "}
                <span className="font-medium text-cocoa">
                  {formatINR(partialAmount)}
                </span>
              </p>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={partialPercent}
              onChange={(e) => setPartialPercent(Number(e.target.value))}
              aria-label="Partial refund percentage"
              className="mt-2 w-full accent-maroon"
            />
            <div className="mt-1 flex justify-between text-[9px] uppercase tracking-[0.14em] text-charcoal/45">
              <span>No refund</span>
              <span>Full refund</span>
            </div>
          </div>

          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-charcoal/55">
              Internal note{" "}
              <span className="text-charcoal/40">(min 10 chars, visible to customer)</span>
            </p>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={300}
              className="mt-2 block w-full resize-none rounded-lg border border-cocoa/20 bg-cream px-3 py-2 text-sm text-charcoal outline-none transition duration-500 placeholder:text-charcoal/40 focus:border-cocoa"
              placeholder="What did you find? This becomes the customer's explanation."
            />
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="mt-3 text-xs text-burnt-red">{error}</p>
      ) : null}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!canSubmit}
        className={`mt-4 w-full rounded-2xl py-3 text-[11px] font-medium uppercase tracking-[0.24em] text-cream shadow-[0_18px_40px_rgba(43,38,35,0.14)] transition duration-500 disabled:opacity-50 ${
          outcome === "fail"
            ? "bg-burnt-red hover:bg-burnt-red/90"
            : "bg-cocoa hover:bg-cocoa/90"
        }`}
      >
        {pending
          ? "Submitting…"
          : outcome === "pass"
            ? `Confirm — ${passLabel}`
            : outcome === "fail"
              ? `Confirm — refund ${formatINR(partialAmount)}`
              : "Pick pass or fail"}
      </button>
    </div>
  );
}
