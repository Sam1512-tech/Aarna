"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Banknote } from "lucide-react";
import { recordCodRefundSent } from "@/lib/actions/admin/returns";
import { actionErrorMessage } from "@/lib/action-error";

/**
 * Shown once a COD return's QC has passed with a nonzero refund and no
 * Razorpay payment to refund against — markReturnQc parks it at
 * "refund_pending" instead of refunding automatically (see that function's
 * own comment). The admin sends the money by hand via UPI to refundUpiId,
 * then confirms it here to close the loop and generate the GST credit note.
 */
export function RecordCodRefundTrigger({
  returnId,
  refundUpiId,
}: {
  returnId: string;
  refundUpiId: string | null;
}) {
  const router = useRouter();
  const [reference, setReference] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      try {
        await recordCodRefundSent(returnId, { reference: reference.trim() || undefined });
        router.refresh();
      } catch (err) {
        setError(actionErrorMessage(err, "Couldn't confirm the refund"));
      }
    });
  }

  return (
    <div className="mt-4 rounded-xl border border-cocoa/20 bg-cocoa/6 px-4 py-4">
      <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-charcoal/55">
        Cash on Delivery — refund awaiting manual UPI transfer
      </p>
      <p className="mt-1 text-xs leading-5 text-charcoal/60">
        {refundUpiId ? (
          <>
            Send the refund to{" "}
            <span className="font-mono text-charcoal/80">{refundUpiId}</span>,
            then confirm below.
          </>
        ) : (
          "The customer didn't provide a UPI ID — contact them for one before sending, then confirm below."
        )}
      </p>
      <label className="mt-3 block">
        <span className="block text-[10px] font-medium uppercase tracking-[0.16em] text-charcoal/55">
          Reference / UTR (optional)
        </span>
        <input
          type="text"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="UPI transaction reference"
          className="mt-1.5 block w-full rounded-xl border border-cocoa/20 bg-cream px-4 py-2.5 text-sm text-charcoal outline-none transition duration-500 focus:border-cocoa"
        />
      </label>
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="mt-3 inline-flex items-center gap-2 rounded-2xl bg-cocoa px-5 py-2.5 text-[11px] font-medium uppercase tracking-[0.24em] text-cream shadow-[0_18px_40px_rgba(43,38,35,0.14)] transition duration-500 hover:bg-cocoa/90 disabled:opacity-50"
      >
        <Banknote className="h-3.5 w-3.5" aria-hidden="true" />
        {pending ? "Confirming…" : "Mark refund sent"}
      </button>
      {error ? <p className="mt-2 text-xs text-burnt-red">{error}</p> : null}
    </div>
  );
}
