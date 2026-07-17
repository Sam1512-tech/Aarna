"use client";

import { useMemo, useState, useTransition } from "react";
import { ArrowLeft, ArrowRight, ChevronDown, RotateCcw, Repeat, X } from "lucide-react";
import { requestReturn } from "@/lib/actions/account";
import { EXCHANGE_REASON_PREFIX } from "@/lib/exchange";
import { formatINR } from "@/lib/utils";

export interface RequestableItem {
  orderItemId: string;
  orderNumber: string;
  productTitle: string;
  variantLabel: string | null;
  quantity: number;
  lineTotal: number;
}

export interface SubmittedRow {
  id: string;
  type: "return" | "exchange";
  orderNumber: string;
  productTitle: string;
  variantLabel: string | null;
  quantity: number;
  reason: string;
  status: string;
  refundAmount: number | null;
  createdAt: Date;
}

type Intent = "return" | "exchange";

interface ReturnCategory {
  value: string;
  label: string;
}

const RETURN_CATEGORIES: ReturnCategory[] = [
  { value: "size_fit", label: "size or fit" },
  { value: "quality", label: "quality issue" },
  { value: "damaged", label: "arrived damaged" },
  { value: "wrong_item", label: "wrong item sent" },
  { value: "changed_mind", label: "changed my mind" },
];

const EXCHANGE_CATEGORIES: ReturnCategory[] = [
  { value: "size_fit", label: "different size" },
  { value: "color", label: "different colour" },
  { value: "style", label: "different style" },
  { value: "damaged", label: "arrived damaged" },
];

const MIN_DETAIL_LEN = 15;
const MAX_DETAIL_LEN = 500;

interface Props {
  open: boolean;
  onClose: () => void;
  eligibleItems: RequestableItem[];
  presetItemId?: string;
  onSubmitted: (row: SubmittedRow) => void;
}

export function ReturnExchangeModal({
  open,
  onClose,
  eligibleItems,
  presetItemId,
  onSubmitted,
}: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [intent, setIntent] = useState<Intent>("return");
  const [orderItemId, setOrderItemId] = useState<string>(
    presetItemId ?? eligibleItems[0]?.orderItemId ?? "",
  );
  const [category, setCategory] = useState<string>("");
  const [detail, setDetail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const chosen = useMemo(
    () => eligibleItems.find((e) => e.orderItemId === orderItemId) ?? null,
    [eligibleItems, orderItemId],
  );

  const categories = intent === "exchange" ? EXCHANGE_CATEGORIES : RETURN_CATEGORIES;
  const detailLen = detail.trim().length;
  const canSubmit =
    !!chosen && !!category && detailLen >= MIN_DETAIL_LEN && detailLen <= MAX_DETAIL_LEN;

  function reset() {
    setStep(1);
    setIntent("return");
    setCategory("");
    setDetail("");
    setError(null);
  }

  function close() {
    reset();
    onClose();
  }

  function handleNext() {
    if (!chosen) {
      setError("please pick an item");
      return;
    }
    setError(null);
    setStep(2);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!chosen || !canSubmit) return;

    // Pack for the current backend contract:
    //  - `reasonCategory` carries the category enum value
    //  - `reason` carries the detail text, prefixed with the exchange marker
    //    when intent = exchange (backend today has no `type` column; PR 2
    //    will replace this hack with a real column and migrate the prefix out)
    const trimmedDetail = detail.trim();
    const reason =
      intent === "exchange"
        ? `${EXCHANGE_REASON_PREFIX} ${trimmedDetail}`
        : trimmedDetail;

    startTransition(async () => {
      try {
        await requestReturn({
          orderItemId: chosen.orderItemId,
          reason,
          reasonCategory: category,
        });
        onSubmitted({
          id: `pending-${Date.now()}`,
          type: intent,
          orderNumber: chosen.orderNumber,
          productTitle: chosen.productTitle,
          variantLabel: chosen.variantLabel,
          quantity: chosen.quantity,
          // The optimistic row shows the same clean text the server stores
          // (requestReturn strips the marker before saving) — trimmedDetail
          // is that text pre-prefix, no need to re-strip it here.
          reason: trimmedDetail,
          status: "requested",
          refundAmount: intent === "return" ? chosen.lineTotal : null,
          createdAt: new Date(),
        });
        close();
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message.toLowerCase()
            : "something went wrong. please try again.",
        );
      }
    });
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="return-exchange-title"
      className="fixed inset-0 z-[70] flex items-end justify-center bg-charcoal/40 backdrop-blur-sm md:items-center"
    >
      <button
        type="button"
        onClick={close}
        aria-label="Close"
        className="absolute inset-0"
      />

      <form
        onSubmit={handleSubmit}
        className="relative z-10 flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-cream shadow-[0_-18px_60px_rgba(43,38,35,0.16)] md:rounded-3xl"
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-cocoa/10 px-6 py-5 md:px-8">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-charcoal/50">
              step {step} of 2
            </p>
            <h2
              id="return-exchange-title"
              className="mt-1 font-display text-2xl lowercase leading-tight text-maroon md:text-3xl"
            >
              {step === 1 ? "return or exchange" : `tell us why`}
            </h2>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-cocoa hover:bg-cocoa/10"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-6 md:px-8">
          {step === 1 ? (
            <StepIntent
              intent={intent}
              setIntent={setIntent}
              eligibleItems={eligibleItems}
              orderItemId={orderItemId}
              setOrderItemId={setOrderItemId}
              locked={!!presetItemId}
            />
          ) : (
            <StepReason
              intent={intent}
              chosen={chosen}
              categories={categories}
              category={category}
              setCategory={setCategory}
              detail={detail}
              setDetail={setDetail}
              detailLen={detailLen}
            />
          )}

          {error ? (
            <p className="mt-4 text-xs lowercase text-burnt-red">{error}</p>
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex gap-3 border-t border-cocoa/10 px-6 py-5 md:px-8">
          {step === 1 ? (
            <>
              <button
                type="button"
                onClick={close}
                className="flex-1 rounded-2xl border border-cocoa/24 bg-cream py-3 text-[11px] font-bold uppercase tracking-[0.24em] text-cocoa"
              >
                cancel
              </button>
              <button
                type="button"
                onClick={handleNext}
                disabled={!chosen}
                className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-maroon py-3 text-[11px] font-medium uppercase tracking-[0.24em] text-cream shadow-[0_18px_40px_rgba(74,31,31,0.22)] transition duration-500 hover:bg-maroon/90 disabled:opacity-50"
              >
                continue
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setStep(1);
                }}
                className="flex items-center justify-center gap-2 rounded-2xl border border-cocoa/24 bg-cream px-5 py-3 text-[11px] font-bold uppercase tracking-[0.24em] text-cocoa"
              >
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                back
              </button>
              <button
                type="submit"
                disabled={!canSubmit || pending}
                className="flex-1 rounded-2xl bg-maroon py-3 text-[11px] font-medium uppercase tracking-[0.24em] text-cream shadow-[0_18px_40px_rgba(74,31,31,0.22)] transition duration-500 hover:bg-maroon/90 disabled:opacity-50"
              >
                {pending
                  ? "submitting…"
                  : intent === "exchange"
                    ? "request exchange"
                    : "request return"}
              </button>
            </>
          )}
        </div>
      </form>
    </div>
  );
}

// ── Step 1: Intent + item ─────────────────────────────────────────────────────

interface StepIntentProps {
  intent: Intent;
  setIntent: (v: Intent) => void;
  eligibleItems: RequestableItem[];
  orderItemId: string;
  setOrderItemId: (v: string) => void;
  locked: boolean;
}

function StepIntent({
  intent,
  setIntent,
  eligibleItems,
  orderItemId,
  setOrderItemId,
  locked,
}: StepIntentProps) {
  const chosen = eligibleItems.find((e) => e.orderItemId === orderItemId);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-charcoal/55">
          what would you like to do?
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <IntentCard
            active={intent === "return"}
            onClick={() => setIntent("return")}
            Icon={RotateCcw}
            title="return"
            copy="refund to your original payment"
          />
          <IntentCard
            active={intent === "exchange"}
            onClick={() => setIntent("exchange")}
            Icon={Repeat}
            title="exchange"
            copy="swap for a different size or piece"
          />
        </div>
      </div>

      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-charcoal/55">
          which piece?
        </p>
        {locked && chosen ? (
          <div className="mt-3 rounded-xl border border-cocoa/16 bg-cream/70 px-4 py-3">
            <p className="font-display text-base lowercase text-maroon">
              {chosen.productTitle.toLowerCase()}
            </p>
            {chosen.variantLabel ? (
              <p className="mt-0.5 text-xs lowercase text-charcoal/55">
                {chosen.variantLabel.toLowerCase()} · qty {chosen.quantity}
              </p>
            ) : null}
            <p className="mt-0.5 text-[10px] uppercase tracking-[0.16em] text-charcoal/45">
              order · {chosen.orderNumber}
            </p>
          </div>
        ) : (
          <div className="relative mt-3">
            <select
              value={orderItemId}
              onChange={(e) => setOrderItemId(e.target.value)}
              className="block w-full appearance-none rounded-xl border border-cocoa/20 bg-cream px-4 py-3 pr-10 text-sm text-charcoal outline-none transition duration-500 focus:border-cocoa"
            >
              {eligibleItems.length === 0 ? (
                <option value="">no eligible items</option>
              ) : null}
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
        )}
      </div>

      {intent === "return" && chosen ? (
        <div className="rounded-xl border border-cocoa/12 bg-cocoa/6 px-4 py-3 text-sm text-charcoal/70">
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-charcoal/55">
            refund preview
          </p>
          <p className="mt-1">
            <span className="font-medium text-cocoa">
              {formatINR(chosen.lineTotal)}
            </span>{" "}
            back to your original payment method in 5–7 business days.
          </p>
        </div>
      ) : null}

      {intent === "exchange" ? (
        <div className="rounded-xl border border-cocoa/12 bg-cocoa/6 px-4 py-3 text-sm text-charcoal/70">
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-charcoal/55">
            how exchanges work
          </p>
          <p className="mt-1 leading-6">
            share which size or piece you&apos;d like in the next step. once we
            receive your original, we&apos;ll ship your swap at no extra cost.
          </p>
        </div>
      ) : null}
    </div>
  );
}

interface IntentCardProps {
  active: boolean;
  onClick: () => void;
  Icon: typeof RotateCcw;
  title: string;
  copy: string;
}
function IntentCard({ active, onClick, Icon, title, copy }: IntentCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex flex-col items-start gap-2 rounded-2xl border p-4 text-left transition duration-500 ${
        active
          ? "border-maroon bg-maroon/8 shadow-[0_10px_28px_rgba(74,31,31,0.12)]"
          : "border-cocoa/22 bg-cream hover:border-cocoa"
      }`}
    >
      <span
        className={`inline-flex h-8 w-8 items-center justify-center rounded-full ${
          active ? "bg-maroon text-cream" : "border border-cocoa/25 text-cocoa"
        }`}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="font-display text-lg lowercase text-maroon">
        {title}
      </span>
      <span className="text-xs leading-5 text-charcoal/60">{copy}</span>
    </button>
  );
}

// ── Step 2: Reason ────────────────────────────────────────────────────────────

interface StepReasonProps {
  intent: Intent;
  chosen: RequestableItem | null;
  categories: ReturnCategory[];
  category: string;
  setCategory: (v: string) => void;
  detail: string;
  setDetail: (v: string) => void;
  detailLen: number;
}

function StepReason({
  intent,
  chosen,
  categories,
  category,
  setCategory,
  detail,
  setDetail,
  detailLen,
}: StepReasonProps) {
  const detailShort = detailLen > 0 && detailLen < MIN_DETAIL_LEN;
  const detailPromptCopy =
    intent === "exchange"
      ? "which size or piece would you like instead? add any notes."
      : "describe the issue so our team can help quickly.";

  return (
    <div className="space-y-6">
      {chosen ? (
        <div className="rounded-xl border border-cocoa/12 bg-cream/70 px-4 py-3">
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-charcoal/55">
            {intent === "exchange" ? "exchanging" : "returning"}
          </p>
          <p className="mt-0.5 font-display text-base lowercase text-maroon">
            {chosen.productTitle.toLowerCase()}
          </p>
          {chosen.variantLabel ? (
            <p className="mt-0.5 text-xs lowercase text-charcoal/55">
              {chosen.variantLabel.toLowerCase()} · qty {chosen.quantity}
            </p>
          ) : null}
        </div>
      ) : null}

      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-charcoal/55">
          reason
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {categories.map((c) => {
            const active = category === c.value;
            return (
              <button
                key={c.value}
                type="button"
                onClick={() => setCategory(c.value)}
                aria-pressed={active}
                className={`rounded-full border px-3 py-1.5 text-xs lowercase transition duration-500 ${
                  active
                    ? "border-maroon bg-maroon text-cream"
                    : "border-cocoa/22 text-charcoal/72 hover:border-cocoa"
                }`}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="flex items-baseline justify-between">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-charcoal/55">
            tell us more
          </p>
          <p
            className={`text-[10px] tabular-nums ${
              detailShort ? "text-burnt-red" : "text-charcoal/45"
            }`}
          >
            {detailLen}/{MAX_DETAIL_LEN}
          </p>
        </div>
        <textarea
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          rows={4}
          maxLength={MAX_DETAIL_LEN}
          placeholder={detailPromptCopy}
          className="mt-2 block w-full resize-none rounded-xl border border-cocoa/20 bg-cream px-4 py-3 text-sm leading-6 text-charcoal outline-none transition duration-500 placeholder:text-charcoal/40 focus:border-cocoa"
        />
        <p
          className={`mt-1.5 text-[11px] ${
            detailShort ? "text-burnt-red" : "text-charcoal/50"
          }`}
        >
          {detailShort
            ? `at least ${MIN_DETAIL_LEN} characters — help us help you`
            : `minimum ${MIN_DETAIL_LEN} characters`}
        </p>
      </div>
    </div>
  );
}
