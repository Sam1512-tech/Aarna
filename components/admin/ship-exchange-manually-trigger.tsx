"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { markExchangeShippedManually } from "@/lib/actions/admin/returns";
import { actionErrorMessage } from "@/lib/action-error";

/**
 * Sits alongside ShipExchangeTrigger for the same "swap approved, needs an
 * outbound shipment" moment — for a replacement that already went out
 * through something other than Delhivery (a local courier like Porter for
 * an in-city order, or handed over in person) and just needs recording, not
 * booking. Collapsed behind a toggle so the default, expected path (Ship
 * replacement via Delhivery) keeps the primary visual weight.
 */
export function ShipExchangeManuallyTrigger({ returnId }: { returnId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [carrier, setCarrier] = useState("");
  const [trackingReference, setTrackingReference] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        await markExchangeShippedManually(returnId, {
          carrier,
          trackingReference: trackingReference.trim() || undefined,
        });
        router.refresh();
      } catch (err) {
        setError(actionErrorMessage(err, "Couldn't record the shipment"));
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
        Shipped a different way?
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-3 rounded-xl border border-cocoa/16 bg-cream px-4 py-4"
    >
      <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-charcoal/55">
        Record a manual shipment
      </p>
      <p className="mt-1 text-xs leading-5 text-charcoal/60">
        For a replacement already sent outside Delhivery — a local courier
        for an in-city order, or handed over in person. This only records
        it and decrements stock; it doesn&apos;t book anything.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <input
          type="text"
          value={carrier}
          onChange={(e) => setCarrier(e.target.value)}
          placeholder="Carrier / method (e.g. Porter)"
          required
          className="rounded-lg border border-cocoa/20 bg-cream px-3 py-2 text-sm text-charcoal placeholder:text-charcoal/40 focus:border-cocoa focus:outline-none"
        />
        <input
          type="text"
          value={trackingReference}
          onChange={(e) => setTrackingReference(e.target.value)}
          placeholder="Tracking reference (optional)"
          className="rounded-lg border border-cocoa/20 bg-cream px-3 py-2 text-sm text-charcoal placeholder:text-charcoal/40 focus:border-cocoa focus:outline-none"
        />
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-2xl bg-cocoa px-5 py-2.5 text-[11px] font-medium uppercase tracking-[0.24em] text-cream shadow-[0_18px_40px_rgba(43,38,35,0.14)] transition duration-500 hover:bg-cocoa/90 disabled:opacity-50"
        >
          {pending ? "Recording…" : "Record shipment"}
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
