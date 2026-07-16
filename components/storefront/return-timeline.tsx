import { Check } from "lucide-react";

/**
 * Vertical progress timeline shown on a return / exchange card. Given the
 * request's current status + optional timestamps, renders each step of the
 * pipeline with a state (past / current / future) so the customer always
 * knows where their piece is.
 *
 * Zero data dependency — pass in a status string and a timestamps map. When
 * PR 2 ships the real fields (deliveredAt, reverseAwb, outboundAwb, etc.)
 * the caller just passes them straight through. Storyboarded against
 * lib/db/schema.ts's return_status enum (the extended one from PR 1).
 */

/** All return_status values from the PR 1 enum, in the display order we want
 *  the timeline to walk through. Some states are dead ends (rejected /
 *  qc_failed) and never appear inline; they're rendered as an alt lane. */
const RETURN_STEPS = [
  "requested",
  "approved",
  "picked",
  "in_transit_to_seller",
  "received",
  "refunded",
] as const;

const EXCHANGE_STEPS = [
  "requested",
  "approved",
  "picked",
  "in_transit_to_seller",
  "received",
  "exchange_shipped",
  "exchange_delivered",
] as const;

const STEP_LABEL: Record<string, string> = {
  requested: "return requested",
  approved: "approved",
  picked: "picked up from your address",
  in_transit_to_seller: "on its way to the studio",
  received: "received · being checked",
  refunded: "refund on its way",
  exchange_shipped: "swap dispatched",
  exchange_delivered: "swap delivered",
  rejected: "not approved",
  qc_failed: "not eligible after checking",
};

type TimelineStep = (typeof RETURN_STEPS | typeof EXCHANGE_STEPS)[number];

export interface ReturnTimelineProps {
  /** "return" shows the refund pipeline; "exchange" swaps the last two steps
      to the outbound shipment leg. */
  type: "return" | "exchange";
  /** Current status from the return_status pgEnum. */
  status: string;
  /** Optional per-step timestamps to show under the label. Keys are enum
      values; values ignored if not a Date/string. */
  timestamps?: Partial<Record<string, Date | string | null>>;
  /** When status is a dead end ("rejected" or "qc_failed"), show this note. */
  reason?: string | null;
}

function fmt(at: Date | string | null | undefined): string | null {
  if (!at) return null;
  const d = typeof at === "string" ? new Date(at) : at;
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
}

export function ReturnTimeline({
  type,
  status,
  timestamps = {},
  reason,
}: ReturnTimelineProps) {
  // Dead-end states get their own compact rendering — no pipeline dots.
  if (status === "rejected" || status === "qc_failed") {
    return (
      <div className="rounded-2xl border border-burnt-red/24 bg-burnt-red/6 p-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-burnt-red">
          {STEP_LABEL[status]}
        </p>
        {reason ? (
          <p className="mt-2 text-sm leading-6 text-charcoal/75">
            {reason}
          </p>
        ) : null}
      </div>
    );
  }

  const steps = (type === "exchange" ? EXCHANGE_STEPS : RETURN_STEPS) as ReadonlyArray<TimelineStep>;
  const currentIndex = steps.indexOf(status as TimelineStep);
  // If the status isn't in the pipeline (e.g. a new enum value we don't
  // know about yet), fall back to showing the first step as current.
  const activeIdx = currentIndex >= 0 ? currentIndex : 0;

  return (
    <ol className="relative ml-1">
      {steps.map((step, i) => {
        const past = i < activeIdx;
        const current = i === activeIdx;
        const timestamp = fmt(timestamps[step]);
        const isLast = i === steps.length - 1;

        return (
          <li key={step} className="relative flex gap-3.5 pb-5 last:pb-0">
            {/* Rail */}
            {!isLast ? (
              <span
                aria-hidden="true"
                className={`absolute left-[7px] top-4 h-[calc(100%-8px)] w-px ${
                  past ? "bg-cocoa/60" : "bg-cocoa/18"
                }`}
              />
            ) : null}

            {/* Dot */}
            <span
              aria-hidden="true"
              className={`relative z-10 mt-1 inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border ${
                past
                  ? "border-cocoa bg-cocoa text-cream"
                  : current
                    ? "border-cocoa bg-cream text-cocoa"
                    : "border-cocoa/30 bg-cream"
              }`}
            >
              {past ? (
                <Check className="h-2 w-2" strokeWidth={3} aria-hidden="true" />
              ) : current ? (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cocoa/40" />
              ) : null}
            </span>

            {/* Label */}
            <div className="min-w-0 flex-1 pt-0.5">
              <p
                className={`text-sm leading-tight ${
                  past
                    ? "text-charcoal/75"
                    : current
                      ? "font-medium text-maroon"
                      : "text-charcoal/45"
                }`}
              >
                {STEP_LABEL[step]}
              </p>
              {timestamp ? (
                <p className="mt-0.5 text-[11px] tabular-nums text-charcoal/50">
                  {timestamp}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
