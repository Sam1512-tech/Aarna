"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { recordReturnRefundedExternally } from "@/lib/actions/admin/returns";
import { actionErrorMessage } from "@/lib/action-error";
import { formatINR } from "@/lib/utils";

/**
 * Sits alongside ReturnQcTrigger for the same "item received, needs a QC
 * outcome" moment — for a return whose refund already happened outside the
 * app (issued directly via the Razorpay dashboard) and just needs
 * recording, not a real refund attempt. Collapsed behind a toggle, same
 * reasoning as ShipExchangeManuallyTrigger: the live QC panel is the
 * expected default path, this is the deliberately-separate exception.
 */
export function RecordExternalRefundTrigger({
  returnId,
  refundAmount,
}: {
  returnId: string;
  refundAmount: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [outcome, setOutcome] = useState<"pass" | "fail">("pass");
  const [refundedRupees, setRefundedRupees] = useState("");
  const [razorpayRefundId, setRazorpayRefundId] = useState("");
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    !pending &&
    note.trim().length >= 10 &&
    (outcome === "pass" || (refundedRupees.trim() !== "" && !Number.isNaN(Number(refundedRupees))));

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    startTransition(async () => {
      try {
        await recordReturnRefundedExternally(returnId, {
          outcome,
          refundAmountPaise:
            outcome === "fail" ? Math.round(Number(refundedRupees) * 100) : undefined,
          razorpayRefundId: razorpayRefundId.trim() || undefined,
          note: note.trim(),
        });
        router.refresh();
      } catch (err) {
        setError(actionErrorMessage(err, "Couldn't record the refund"));
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="soft-link mt-2 text-[11px] font-medium uppercase tracking-[0.16em] text-charcoal/55 hover:text-cocoa"
      >
        Refund already processed outside the app?
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-3 rounded-xl border border-cocoa/16 bg-cream px-4 py-4"
    >
      <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-charcoal/55">
        Record a refund already issued externally
      </p>
      <p className="mt-1 text-xs leading-5 text-charcoal/60">
        For a refund already sent directly from the Razorpay dashboard. This
        only records it — it never calls Razorpay, which would reject a
        refund that&apos;s already been issued.
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setOutcome("pass")}
          aria-pressed={outcome === "pass"}
          className={`rounded-xl border px-3 py-2 text-left text-sm transition duration-300 ${
            outcome === "pass"
              ? "border-cocoa bg-cocoa/12 text-charcoal/90"
              : "border-cocoa/20 bg-cream text-charcoal/70 hover:border-cocoa"
          }`}
        >
          Pass — full refund ({formatINR(refundAmount)})
        </button>
        <button
          type="button"
          onClick={() => setOutcome("fail")}
          aria-pressed={outcome === "fail"}
          className={`rounded-xl border px-3 py-2 text-left text-sm transition duration-300 ${
            outcome === "fail"
              ? "border-burnt-red bg-burnt-red/8 text-charcoal/90"
              : "border-cocoa/20 bg-cream text-charcoal/70 hover:border-cocoa"
          }`}
        >
          Fail — partial or no refund
        </button>
      </div>

      {outcome === "fail" ? (
        <label className="mt-3 block">
          <span className="block text-[10px] font-medium uppercase tracking-[0.16em] text-charcoal/55">
            Amount actually refunded (₹)
          </span>
          <input
            type="number"
            min={0}
            max={refundAmount / 100}
            step="0.01"
            value={refundedRupees}
            onChange={(e) => setRefundedRupees(e.target.value)}
            placeholder="0.00"
            className="mt-1.5 block w-full rounded-lg border border-cocoa/20 bg-cream px-3 py-2 text-sm text-charcoal outline-none transition duration-500 focus:border-cocoa"
          />
        </label>
      ) : null}

      <label className="mt-3 block">
        <span className="block text-[10px] font-medium uppercase tracking-[0.16em] text-charcoal/55">
          Razorpay refund ID (optional, from the dashboard)
        </span>
        <input
          type="text"
          value={razorpayRefundId}
          onChange={(e) => setRazorpayRefundId(e.target.value)}
          placeholder="rfnd_..."
          className="mt-1.5 block w-full rounded-lg border border-cocoa/20 bg-cream px-3 py-2 text-sm text-charcoal outline-none transition duration-500 focus:border-cocoa"
        />
      </label>

      <label className="mt-3 block">
        <span className="block text-[10px] font-medium uppercase tracking-[0.16em] text-charcoal/55">
          Note <span className="text-charcoal/40">(min 10 chars — what happened)</span>
        </span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          maxLength={300}
          placeholder="e.g. Refund was sent directly via the Razorpay dashboard before this order reached QC."
          className="mt-1.5 block w-full resize-none rounded-lg border border-cocoa/20 bg-cream px-3 py-2 text-sm text-charcoal outline-none transition duration-500 placeholder:text-charcoal/40 focus:border-cocoa"
        />
      </label>

      <div className="mt-3 flex items-center gap-3">
        <button
          type="submit"
          disabled={!canSubmit}
          className="inline-flex items-center gap-2 rounded-2xl bg-cocoa px-5 py-2.5 text-[11px] font-medium uppercase tracking-[0.24em] text-cream shadow-[0_18px_40px_rgba(43,38,35,0.14)] transition duration-500 hover:bg-cocoa/90 disabled:opacity-50"
        >
          {pending ? "Recording…" : "Record refund"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={pending}
          className="text-[11px] font-medium uppercase tracking-[0.16em] text-charcoal/55 hover:text-cocoa disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
      {error ? <p className="mt-2 text-xs text-burnt-red">{error}</p> : null}
    </form>
  );
}
