"use client";

import { ChevronDown, Plus, Repeat, X } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { requestReturn } from "@/lib/actions/account";
import { EXCHANGE_REASON_PREFIX } from "@/lib/exchange";
import { actionErrorMessage } from "@/lib/action-error";

export interface ExchangeRow {
  id: string;
  orderNumber: string;
  productTitle: string;
  variantLabel: string | null;
  quantity: number;
  reason: string;
  status: string;
  createdAt: Date | string;
}
export interface EligibleItem {
  orderItemId: string;
  orderNumber: string;
  productTitle: string;
  variantLabel: string | null;
  quantity: number;
  lineTotal: number;
}

interface AccountExchangesViewProps {
  exchanges: ExchangeRow[];
  eligibleItems: EligibleItem[];
}

const REASON_CATEGORIES = [
  { value: "size_fit", label: "Different size" },
  { value: "color", label: "Different colour" },
  { value: "style", label: "Different style" },
  { value: "changed_mind", label: "Changed my mind" },
] as const;

// Keys match the return_status pgEnum in lib/db/schema.ts. Exchange requests
// piggyback on the returns pipeline until Sam ships a dedicated exchange model.
const STATUS_LABEL: Record<string, string> = {
  requested: "Requested",
  approved: "Approved",
  picked: "Picked up",
  received: "Received",
  refunded: "Swap dispatched",
  rejected: "Declined",
};

function fmtDate(d: Date | string) {
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// The reason text we send to requestReturn is structured as
//   "Exchange requested. Desired size <s>, colour <c>. Note: <note>"
// so we can filter these back out here + Sam's team gets the intent in
// the admin returns queue. This helper pulls the human-readable bits
// back out for the list card.
function humaniseExchangeReason(raw: string) {
  const trimmed = raw.startsWith(EXCHANGE_REASON_PREFIX)
    ? raw.slice(EXCHANGE_REASON_PREFIX.length).trim()
    : raw;
  return trimmed || "swap requested";
}

export function AccountExchangesView({
  exchanges: initial,
  eligibleItems,
}: AccountExchangesViewProps) {
  const [exchanges, setExchanges] = useState<ExchangeRow[]>(initial);
  const [formOpen, setFormOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleAdd(row: ExchangeRow) {
    setExchanges((prev) => [row, ...prev]);
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-charcoal/55">
          your exchanges · {exchanges.length}
        </p>
        {eligibleItems.length > 0 ? (
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="inline-flex items-center gap-2 rounded-full bg-cocoa px-4 py-2 text-[11px] font-medium uppercase tracking-[0.18em] text-cream transition duration-500 hover:bg-cocoa/90"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Request exchange
          </button>
        ) : null}
      </div>

      {error ? (
        <p className="mt-4 text-xs text-burnt-red">{error}</p>
      ) : null}

      {exchanges.length === 0 ? (
        <div className="mt-6 flex flex-col items-center rounded-2xl border border-cocoa/12 bg-cream/70 py-14 text-center">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-full border border-cocoa/20 text-cocoa">
            <Repeat className="h-5 w-5" aria-hidden="true" />
          </span>
          <h2 className="mt-5 font-display text-2xl text-maroon">
            No exchanges yet
          </h2>
          <p className="mt-2 max-w-sm text-sm text-charcoal/60">
            Swap a size or colour within 3 days of delivery.
            {eligibleItems.length === 0 ? " no eligible items right now." : ""}
          </p>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {exchanges.map((r) => (
            <li
              key={r.id}
              className="rounded-2xl border border-cocoa/12 bg-cream p-5 shadow-[0_10px_28px_rgba(43,38,35,0.04)]"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-charcoal/55">
                    order · {r.orderNumber} · raised {fmtDate(r.createdAt)}
                  </p>
                  <p className="mt-1 font-display text-lg text-maroon">
                    {r.productTitle}
                  </p>
                  {r.variantLabel ? (
                    <p className="text-xs text-charcoal/55">
                      Current · {r.variantLabel} · qty {r.quantity}
                    </p>
                  ) : null}
                </div>
                <span className="rounded-full border border-cocoa/22 bg-cocoa/8 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.16em] text-cocoa">
                  {STATUS_LABEL[r.status] ?? r.status}
                </span>
              </div>
              <p className="mt-3 border-t border-cocoa/8 pt-3 text-sm text-charcoal/70">
                {humaniseExchangeReason(r.reason)}
              </p>
            </li>
          ))}
        </ul>
      )}

      {formOpen ? (
        <ExchangeRequestForm
          eligibleItems={eligibleItems}
          onCancel={() => setFormOpen(false)}
          onSubmitted={(row) => {
            handleAdd(row);
            setFormOpen(false);
          }}
          onError={(msg) => setError(msg)}
        />
      ) : null}
    </div>
  );
}

function ExchangeRequestForm({
  eligibleItems,
  onCancel,
  onSubmitted,
  onError,
}: {
  eligibleItems: EligibleItem[];
  onCancel: () => void;
  onSubmitted: (row: ExchangeRow) => void;
  onError: (msg: string) => void;
}) {
  const [orderItemId, setOrderItemId] = useState<string>(
    eligibleItems[0]?.orderItemId ?? "",
  );
  const [reasonCategory, setReasonCategory] = useState<string>("size_fit");
  const [desiredSize, setDesiredSize] = useState("");
  const [desiredColor, setDesiredColor] = useState("");
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

  const chosen = useMemo(
    () => eligibleItems.find((e) => e.orderItemId === orderItemId),
    [eligibleItems, orderItemId],
  );

  const wantsSize = reasonCategory === "size_fit";
  const wantsColor = reasonCategory === "color";
  const canSubmit =
    !!orderItemId &&
    !!reasonCategory &&
    (wantsSize ? desiredSize.trim().length > 0 : true) &&
    (wantsColor ? desiredColor.trim().length > 0 : true);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    startTransition(async () => {
      try {
        const parts: string[] = [EXCHANGE_REASON_PREFIX];
        const desired: string[] = [];
        if (desiredSize.trim()) desired.push(`size ${desiredSize.trim()}`);
        if (desiredColor.trim())
          desired.push(`colour ${desiredColor.trim()}`);
        if (desired.length > 0)
          parts.push(`Desired: ${desired.join(", ")}.`);
        if (note.trim()) parts.push(`Note: ${note.trim()}`);
        const reasonText = parts.join(" ");

        await requestReturn({
          orderItemId,
          reason: reasonText,
          reasonCategory: "exchange",
        });
        if (!chosen) return;
        onSubmitted({
          id: `pending-${Date.now()}`,
          orderNumber: chosen.orderNumber,
          productTitle: chosen.productTitle,
          variantLabel: chosen.variantLabel,
          quantity: chosen.quantity,
          reason: reasonText,
          status: "requested",
          createdAt: new Date(),
        });
      } catch (err) {
        onError(
          actionErrorMessage(err, "Couldn't raise exchange"),
        );
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-charcoal/40 backdrop-blur-sm md:items-center"
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        onClick={onCancel}
        aria-label="Close"
        className="absolute inset-0"
      />
      <form
        onSubmit={handleSubmit}
        className="relative z-10 w-full max-w-lg rounded-t-3xl bg-cream p-6 shadow-[0_-18px_60px_rgba(43,38,35,0.16)] md:rounded-3xl md:p-8"
      >
        <div className="flex items-start justify-between">
          <h2 className="font-display text-3xl text-maroon">
            Request exchange
          </h2>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-cocoa hover:bg-cocoa/10"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <label className="block">
            <span className="block text-[11px] font-medium uppercase tracking-[0.18em] text-charcoal/55">
              Which piece?
            </span>
            <div className="relative mt-1.5">
              <select
                value={orderItemId}
                onChange={(e) => setOrderItemId(e.target.value)}
                className="block w-full appearance-none rounded-xl border border-cocoa/20 bg-cream px-4 py-2.5 pr-10 text-base text-charcoal outline-none transition duration-500 focus:border-cocoa"
              >
                {eligibleItems.map((it) => (
                  <option key={it.orderItemId} value={it.orderItemId}>
                    {it.productTitle}
                    {it.variantLabel ? ` (${it.variantLabel})` : ""} · order{" "}
                    {it.orderNumber}
                  </option>
                ))}
              </select>
              <ChevronDown
                className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cocoa"
                aria-hidden="true"
              />
            </div>
            {chosen?.variantLabel ? (
              <p className="mt-1.5 text-xs text-charcoal/55">
                You currently have {chosen.variantLabel}
              </p>
            ) : null}
          </label>

          <label className="block">
            <span className="block text-[11px] font-medium uppercase tracking-[0.18em] text-charcoal/55">
              What would you like instead?
            </span>
            <div className="mt-2 flex flex-wrap gap-2">
              {REASON_CATEGORIES.map((c) => {
                const active = reasonCategory === c.value;
                return (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setReasonCategory(c.value)}
                    className={`rounded-full border px-3 py-1.5 text-xs transition duration-500 ${
                      active
                        ? "border-cocoa bg-cocoa text-cream"
                        : "border-cocoa/22 bg-cocoa/6 text-charcoal/72 hover:border-cocoa hover:bg-cocoa/10"
                    }`}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
          </label>

          {wantsSize ? (
            <label className="block">
              <span className="block text-[11px] font-medium uppercase tracking-[0.18em] text-charcoal/55">
                Desired size
              </span>
              <input
                value={desiredSize}
                onChange={(e) => setDesiredSize(e.target.value)}
                placeholder="E.g. M or 10"
                className="mt-2 block w-full rounded-xl border border-cocoa/20 bg-cream px-4 py-2.5 text-base text-charcoal outline-none transition duration-500 focus:border-cocoa"
              />
            </label>
          ) : null}

          {wantsColor ? (
            <label className="block">
              <span className="block text-[11px] font-medium uppercase tracking-[0.18em] text-charcoal/55">
                Desired colour
              </span>
              <input
                value={desiredColor}
                onChange={(e) => setDesiredColor(e.target.value)}
                placeholder="E.g. sand, ivory, charcoal"
                className="mt-2 block w-full rounded-xl border border-cocoa/20 bg-cream px-4 py-2.5 text-base text-charcoal outline-none transition duration-500 focus:border-cocoa"
              />
            </label>
          ) : null}

          <label className="block">
            <span className="block text-[11px] font-medium uppercase tracking-[0.18em] text-charcoal/55">
              Anything else to add?
            </span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Preferences, colour swap, timing — anything that helps our team."
              className="mt-2 block w-full resize-none rounded-xl border border-cocoa/20 bg-cream px-4 py-3 text-sm leading-6 text-charcoal outline-none transition duration-500 placeholder:text-charcoal/40 focus:border-cocoa"
            />
          </label>

          <p className="text-xs leading-5 text-charcoal/55">
            Once we approve your request we&rsquo;ll pick up the current piece
            and dispatch the swap. your status will move through this list.
          </p>
        </div>

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-2xl border border-cocoa/24 bg-cocoa/6 py-3 text-[11px] font-bold uppercase tracking-[0.24em] text-cocoa transition duration-500 hover:bg-cocoa/10"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit || pending}
            className="flex-1 rounded-2xl bg-cocoa py-3 text-[11px] font-medium uppercase tracking-[0.24em] text-cream shadow-[0_18px_40px_rgba(140,106,90,0.24)] transition duration-500 hover:bg-cocoa/90 disabled:opacity-50"
          >
            {pending ? "requesting…" : "request exchange"}
          </button>
        </div>
      </form>
    </div>
  );
}
