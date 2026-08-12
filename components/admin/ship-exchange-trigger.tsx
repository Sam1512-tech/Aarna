"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Truck } from "lucide-react";
import { createExchangeShipment } from "@/lib/actions/admin/returns";
import { actionErrorMessage } from "@/lib/action-error";

/**
 * Shown once an exchange has passed QC (status "refunded") and has no
 * outbound shipment yet — the "actually send the replacement" step,
 * deliberately separate from ReturnQcTrigger/markReturnQc. See
 * createExchangeShipment's own comment for why.
 */
export function ShipExchangeTrigger({ returnId }: { returnId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      try {
        await createExchangeShipment(returnId);
        router.refresh();
      } catch (err) {
        setError(actionErrorMessage(err, "Couldn't create the shipment"));
      }
    });
  }

  return (
    <div className="mt-4 rounded-xl border border-cocoa/20 bg-cocoa/6 px-4 py-4">
      <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-charcoal/55">
        Swap approved
      </p>
      <p className="mt-1 text-xs leading-5 text-charcoal/60">
        Book the outbound shipment for the replacement — this books a real
        Delhivery pickup and decrements its stock.
      </p>
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="mt-3 inline-flex items-center gap-2 rounded-2xl bg-cocoa px-5 py-2.5 text-[11px] font-medium uppercase tracking-[0.24em] text-cream shadow-[0_18px_40px_rgba(43,38,35,0.14)] transition duration-500 hover:bg-cocoa/90 disabled:opacity-50"
      >
        <Truck className="h-3.5 w-3.5" aria-hidden="true" />
        {pending ? "Booking…" : "Ship replacement"}
      </button>
      {error ? <p className="mt-2 text-xs text-burnt-red">{error}</p> : null}
    </div>
  );
}
