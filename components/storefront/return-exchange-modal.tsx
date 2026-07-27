"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, ChevronDown, RotateCcw, Repeat, X } from "lucide-react";
import { requestReturn } from "@/lib/actions/account";
import { getVariantsInStockForProduct } from "@/lib/actions/products";
import { ExchangeVariantChooser, type VariantOption } from "@/components/storefront/exchange-variant-chooser";
import { ReturnPhotoUploader } from "@/components/storefront/return-photo-uploader";
import { uploadReturnPhoto } from "@/lib/cloudinary/upload-return-photo";
import { formatINR } from "@/lib/utils";
import { useModalLock } from "@/hooks/use-modal-lock";

export interface RequestableItem {
  orderItemId: string;
  orderNumber: string;
  productId: string;
  variantId: string;
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
  { value: "size_fit", label: "Size or fit" },
  { value: "quality", label: "Quality issue" },
  { value: "damaged", label: "Arrived damaged" },
  { value: "wrong_item", label: "Wrong item sent" },
  { value: "changed_mind", label: "Changed my mind" },
];

const EXCHANGE_CATEGORIES: ReturnCategory[] = [
  { value: "size_fit", label: "Different size" },
  { value: "color", label: "Different colour" },
  { value: "style", label: "Different style" },
  { value: "damaged", label: "Arrived damaged" },
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
  const [photos, setPhotos] = useState<string[]>([]);
  const [desiredVariantId, setDesiredVariantId] = useState<string | null>(null);
  const [variantOptions, setVariantOptions] = useState<VariantOption[]>([]);
  const [variantsLoading, startVariantsTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useModalLock(open, onClose);

  const chosen = useMemo(
    () => eligibleItems.find((e) => e.orderItemId === orderItemId) ?? null,
    [eligibleItems, orderItemId],
  );

  // Fetch exchange targets whenever the chosen item or intent changes —
  // covers landing on step 2 with "exchange" already picked and switching
  // items/intent mid-flow. Not requested for "return" (nothing to show).
  // startTransition's own pending flag tracks loading, so no manual
  // setState fires synchronously in the effect body.
  useEffect(() => {
    if (intent !== "exchange" || !chosen) {
      return;
    }
    let cancelled = false;
    startVariantsTransition(async () => {
      const options = await getVariantsInStockForProduct(
        chosen.productId,
        chosen.variantId,
      );
      if (!cancelled) {
        setVariantOptions(options);
        setDesiredVariantId(null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [intent, chosen]);

  const categories = intent === "exchange" ? EXCHANGE_CATEGORIES : RETURN_CATEGORIES;
  const detailLen = detail.trim().length;
  const photosRequired = category === "damaged";
  const photosOk = !photosRequired || photos.length > 0;
  const variantOk =
    intent === "return" || variantOptions.length === 0 || !!desiredVariantId;
  const canSubmit =
    !!chosen &&
    !!category &&
    detailLen >= MIN_DETAIL_LEN &&
    detailLen <= MAX_DETAIL_LEN &&
    photosOk &&
    variantOk;

  function reset() {
    setStep(1);
    setIntent("return");
    setCategory("");
    setDetail("");
    setPhotos([]);
    setDesiredVariantId(null);
    setVariantOptions([]);
    setError(null);
  }

  function close() {
    reset();
    onClose();
  }

  function handleNext() {
    if (!chosen) {
      setError("Please pick an item");
      return;
    }
    setError(null);
    setStep(2);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!chosen || !canSubmit) return;

    const trimmedDetail = detail.trim();

    startTransition(async () => {
      try {
        await requestReturn({
          orderItemId: chosen.orderItemId,
          reason: trimmedDetail,
          reasonCategory: category,
          type: intent,
          desiredVariantId:
            intent === "exchange" ? (desiredVariantId ?? undefined) : undefined,
          photos,
        });
        onSubmitted({
          id: `pending-${Date.now()}`,
          type: intent,
          orderNumber: chosen.orderNumber,
          productTitle: chosen.productTitle,
          variantLabel: chosen.variantLabel,
          quantity: chosen.quantity,
          reason: trimmedDetail,
          status: "requested",
          refundAmount: intent === "return" ? chosen.lineTotal : null,
          createdAt: new Date(),
        });
        close();
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Something went wrong. Please try again.",
        );
      }
    });
  }

  if (!open) return null;

  // Portaled to document.body — this modal is opened from account pages
  // wrapped in the site-wide `.paper-grain` class (app/globals.css), which
  // sets `isolation: isolate` and therefore traps any inline (non-portaled)
  // `position: fixed` descendant in its own stacking context. That means a
  // fixed modal rendered here would never be able to paint above the site
  // header (also fixed, but outside the trap), regardless of z-index —
  // confirmed live on the near-identical account-addresses-view.tsx modal via
  // elementFromPoint hit-testing, and previously diagnosed once already for
  // the PLP mobile filter sheet (see plp-view.tsx). Portaling escapes this
  // regardless of which page renders the modal.
  return createPortal(
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
        // dvh (not vh) — mobile Safari/Chrome's collapsing URL bar means
        // plain vh can size this taller than what's actually visible when
        // the toolbar is showing, same fix already applied in size-guide-modal.tsx.
        className="relative z-10 flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-cream shadow-[0_-18px_60px_rgba(43,38,35,0.16)] md:max-h-[92vh] md:rounded-3xl"
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-cocoa/10 px-6 py-5 md:px-8">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-charcoal/50">
              step {step} of 2
            </p>
            <h2
              id="return-exchange-title"
              className="mt-1 font-display text-2xl leading-tight text-maroon md:text-3xl"
            >
              {step === 1 ? "Return or exchange" : "Tell us why"}
            </h2>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-cocoa hover:bg-cocoa/10"
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
              photos={photos}
              setPhotos={setPhotos}
              photosRequired={photosRequired}
              desiredVariantId={desiredVariantId}
              setDesiredVariantId={setDesiredVariantId}
              variantOptions={variantOptions}
              variantsLoading={variantsLoading}
            />
          )}

          {error ? (
            <p className="mt-4 text-xs text-burnt-red">{error}</p>
          ) : null}
        </div>

        {/* Footer — extra bottom clearance for the iPhone home-indicator
            safe area (the app opts into viewport-fit=cover), same fix
            already applied to the cart's wishlist toast. */}
        <div
          className="flex gap-3 border-t border-cocoa/10 px-6 pt-5 md:px-8"
          style={{ paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom))" }}
        >
          {step === 1 ? (
            <>
              <button
                type="button"
                onClick={close}
                className="flex-1 rounded-2xl border border-cocoa/24 bg-cream py-3 text-[11px] font-bold uppercase tracking-[0.24em] text-cocoa"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleNext}
                disabled={!chosen}
                className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-maroon py-3 text-[11px] font-medium uppercase tracking-[0.24em] text-cream shadow-[0_18px_40px_rgba(74,31,31,0.22)] transition duration-500 hover:bg-maroon/90 disabled:opacity-50"
              >
                Continue
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
                Back
              </button>
              <button
                type="submit"
                disabled={!canSubmit || pending}
                className="flex-1 rounded-2xl bg-maroon py-3 text-[11px] font-medium uppercase tracking-[0.24em] text-cream shadow-[0_18px_40px_rgba(74,31,31,0.22)] transition duration-500 hover:bg-maroon/90 disabled:opacity-50"
              >
                {pending
                  ? "Submitting…"
                  : intent === "exchange"
                    ? "Request exchange"
                    : "Request return"}
              </button>
            </>
          )}
        </div>
      </form>
    </div>,
    document.body,
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
            title="Return"
            copy="Refund to your original payment"
          />
          <IntentCard
            active={intent === "exchange"}
            onClick={() => setIntent("exchange")}
            Icon={Repeat}
            title="Exchange"
            copy="Swap for a different size or piece"
          />
        </div>
      </div>

      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-charcoal/55">
          which piece?
        </p>
        {locked && chosen ? (
          <div className="mt-3 rounded-xl border border-cocoa/16 bg-cream/70 px-4 py-3">
            <p className="font-display text-base text-maroon">
              {chosen.productTitle}
            </p>
            {chosen.variantLabel ? (
              <p className="mt-0.5 text-xs text-charcoal/55">
                {chosen.variantLabel} · Qty {chosen.quantity}
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
              className="block w-full appearance-none rounded-xl border border-cocoa/20 bg-cream px-4 py-3 pr-10 text-base text-charcoal outline-none transition duration-500 focus:border-cocoa"
            >
              {eligibleItems.length === 0 ? (
                <option value="">No eligible items</option>
              ) : null}
              {eligibleItems.map((it) => (
                <option key={it.orderItemId} value={it.orderItemId}>
                  {it.productTitle}
                  {it.variantLabel ? ` (${it.variantLabel})` : ""} · Order{" "}
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
            Share which size or piece you&apos;d like in the next step. Once we
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
      <span className="font-display text-lg text-maroon">
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
  photos: string[];
  setPhotos: (v: string[]) => void;
  photosRequired: boolean;
  desiredVariantId: string | null;
  setDesiredVariantId: (v: string) => void;
  variantOptions: VariantOption[];
  variantsLoading: boolean;
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
  photos,
  setPhotos,
  photosRequired,
  desiredVariantId,
  setDesiredVariantId,
  variantOptions,
  variantsLoading,
}: StepReasonProps) {
  const detailShort = detailLen > 0 && detailLen < MIN_DETAIL_LEN;
  const detailPromptCopy =
    intent === "exchange"
      ? "Anything else we should know? Add any notes."
      : "Describe the issue so our team can help quickly.";

  return (
    <div className="space-y-6">
      {chosen ? (
        <div className="rounded-xl border border-cocoa/12 bg-cream/70 px-4 py-3">
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-charcoal/55">
            {intent === "exchange" ? "exchanging" : "returning"}
          </p>
          <p className="mt-0.5 font-display text-base text-maroon">
            {chosen.productTitle}
          </p>
          {chosen.variantLabel ? (
            <p className="mt-0.5 text-xs text-charcoal/55">
              {chosen.variantLabel} · Qty {chosen.quantity}
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
                className={`rounded-full border px-3 py-1.5 text-xs transition duration-500 ${
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

      {intent === "exchange" ? (
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-charcoal/55">
            swap for
          </p>
          <ExchangeVariantChooser
            variants={variantOptions}
            selectedVariantId={desiredVariantId}
            onSelect={setDesiredVariantId}
            loading={variantsLoading}
          />
        </div>
      ) : null}

      <div>
        <ReturnPhotoUploader
          photos={photos}
          onChange={setPhotos}
          uploadPhoto={uploadReturnPhoto}
          required={photosRequired}
          hint={
            photosRequired
              ? "A photo of the damage helps us process this faster."
              : "Optional — a quick photo helps us process this faster."
          }
        />
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
          className="mt-2 block w-full resize-none rounded-xl border border-cocoa/20 bg-cream px-4 py-3 text-base leading-6 text-charcoal outline-none transition duration-500 placeholder:text-charcoal/40 focus:border-cocoa"
        />
        <p
          className={`mt-1.5 text-[11px] ${
            detailShort ? "text-burnt-red" : "text-charcoal/50"
          }`}
        >
          {detailShort
            ? `At least ${MIN_DETAIL_LEN} characters — help us help you`
            : `Minimum ${MIN_DETAIL_LEN} characters`}
        </p>
      </div>
    </div>
  );
}
