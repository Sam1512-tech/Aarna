"use client";

import { useState, useTransition } from "react";
import { AlertTriangle } from "lucide-react";

export const REJECT_REASONS = [
  { value: "window_expired", label: "Outside the 3-day window" },
  { value: "not_eligible", label: "Not eligible for return" },
  { value: "photos_insufficient", label: "Photos don't show the issue" },
  { value: "used_or_altered", label: "Piece appears worn or altered" },
  { value: "other", label: "Other (add a note)" },
] as const;

export type RejectReason = (typeof REJECT_REASONS)[number]["value"];

export interface ReturnRejectPickerProps {
  onReject: (payload: { reason: RejectReason; note?: string }) => Promise<void>;
  onCancel: () => void;
}

/**
 * Dialog rendered from the admin return card when admin picks "reject" from
 * the status control. Structured reason gets stored on the return row
 * (rejectionReason column from Sam's PR 2) and surfaced to the customer.
 */
export function ReturnRejectPicker({
  onReject,
  onCancel,
}: ReturnRejectPickerProps) {
  const [reason, setReason] = useState<RejectReason | "">("");
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const needsNote = reason === "other";
  const canSubmit =
    !!reason && (!needsNote || note.trim().length >= 10) && !pending;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !reason) return;
    setError(null);
    startTransition(async () => {
      try {
        await onReject({ reason, note: note.trim() || undefined });
      } catch (err) {
        setError(err instanceof Error ? err.message : "couldn't reject");
      }
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reject-title"
      className="fixed inset-0 z-[70] flex items-end justify-center bg-charcoal/40 backdrop-blur-sm md:items-center"
    >
      <button
        type="button"
        onClick={onCancel}
        aria-label="Close"
        className="absolute inset-0"
      />
      <form
        onSubmit={handleSubmit}
        className="relative z-10 w-full max-w-md rounded-t-3xl bg-cream shadow-[0_-18px_60px_rgba(43,38,35,0.16)] md:rounded-3xl"
      >
        <div className="flex items-start gap-3 border-b border-cocoa/10 px-6 py-5 md:px-8">
          <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-burnt-red/30 bg-burnt-red/8 text-burnt-red">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <h2
              id="reject-title"
              className="font-display text-2xl lowercase leading-tight text-maroon"
            >
              reject this request
            </h2>
            <p className="mt-1 text-xs leading-5 text-charcoal/60">
              the customer sees the reason on their account. they can reply and
              re-submit with better evidence.
            </p>
          </div>
        </div>

        <div className="space-y-4 px-6 py-5 md:px-8">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-charcoal/55">
              reason
            </p>
            <div className="mt-2 space-y-2">
              {REJECT_REASONS.map((r) => {
                const active = reason === r.value;
                return (
                  <label
                    key={r.value}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition duration-300 ${
                      active
                        ? "border-maroon bg-maroon/6"
                        : "border-cocoa/16 bg-cream hover:border-cocoa/30"
                    }`}
                  >
                    <input
                      type="radio"
                      name="reject-reason"
                      value={r.value}
                      checked={active}
                      onChange={() => setReason(r.value)}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-maroon"
                    />
                    <span className="text-sm text-charcoal/80">{r.label}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {needsNote ? (
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-charcoal/55">
                note to customer{" "}
                <span className="text-charcoal/40">(min 10 chars)</span>
              </p>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                maxLength={400}
                className="mt-2 block w-full resize-none rounded-xl border border-cocoa/20 bg-cream px-4 py-3 text-sm leading-6 text-charcoal outline-none transition duration-500 placeholder:text-charcoal/40 focus:border-cocoa"
                placeholder="explain why so the customer can respond or re-submit."
              />
            </div>
          ) : null}

          {error ? (
            <p className="text-xs text-burnt-red">{error}</p>
          ) : null}
        </div>

        <div className="flex gap-3 border-t border-cocoa/10 px-6 py-5 md:px-8">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-2xl border border-cocoa/24 bg-cream py-3 text-[11px] font-bold uppercase tracking-[0.24em] text-cocoa"
          >
            cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="flex-1 rounded-2xl bg-burnt-red py-3 text-[11px] font-medium uppercase tracking-[0.24em] text-cream shadow-[0_18px_40px_rgba(122,59,50,0.22)] transition duration-500 hover:bg-burnt-red/90 disabled:opacity-50"
          >
            {pending ? "rejecting…" : "reject request"}
          </button>
        </div>
      </form>
    </div>
  );
}
