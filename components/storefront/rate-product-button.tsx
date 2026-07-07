"use client";

import { Star, X } from "lucide-react";
import { useState, useTransition } from "react";
import { submitReview } from "@/lib/actions/reviews";

export function RateProductButton({
  orderItemId,
  productTitle,
  existingReview,
}: {
  orderItemId: string;
  productTitle: string;
  existingReview: { rating: number; body: string | null } | null;
}) {
  const [open, setOpen] = useState(false);
  const [reviewed, setReviewed] = useState<{ rating: number; body: string | null } | null>(
    existingReview,
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="soft-link shrink-0 text-[11px] font-bold uppercase tracking-[0.16em] text-cocoa"
      >
        {reviewed ? "edit review" : "rate this"}
      </button>
      {open ? (
        <ReviewModal
          orderItemId={orderItemId}
          productTitle={productTitle}
          existingReview={reviewed}
          onCancel={() => setOpen(false)}
          onSubmitted={(saved) => {
            setReviewed(saved);
            setOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

function ReviewModal({
  orderItemId,
  productTitle,
  existingReview,
  onCancel,
  onSubmitted,
}: {
  orderItemId: string;
  productTitle: string;
  existingReview: { rating: number; body: string | null } | null;
  onCancel: () => void;
  onSubmitted: (saved: { rating: number; body: string | null }) => void;
}) {
  const [rating, setRating] = useState(existingReview?.rating ?? 0);
  const [body, setBody] = useState(existingReview?.body ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const canSubmit = rating >= 1 && rating <= 5 && !pending;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    startTransition(async () => {
      try {
        const trimmedBody = body.trim();
        await submitReview({
          orderItemId,
          rating,
          body: trimmedBody || undefined,
        });
        onSubmitted({ rating, body: trimmedBody || null });
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message.toLowerCase()
            : "couldn't submit review",
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
          <h2 className="font-display text-3xl lowercase text-maroon">
            {existingReview ? "edit your review" : "rate this piece"}
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
        <p className="mt-1 truncate text-sm lowercase text-charcoal/60">
          {productTitle.toLowerCase()}
        </p>

        <div className="mt-5 space-y-4">
          <label className="block">
            <span className="block text-[11px] font-medium uppercase tracking-[0.18em] text-charcoal/55">
              your rating
            </span>
            <div className="mt-2 flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(n)}
                  aria-label={`${n} star${n > 1 ? "s" : ""}`}
                  className="p-1"
                >
                  <Star
                    className={`h-7 w-7 transition duration-300 ${
                      n <= rating
                        ? "fill-maroon text-maroon"
                        : "fill-transparent text-cocoa/25"
                    }`}
                    aria-hidden="true"
                  />
                </button>
              ))}
            </div>
          </label>

          <label className="block">
            <span className="block text-[11px] font-medium uppercase tracking-[0.18em] text-charcoal/55">
              tell us more (optional)
            </span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              placeholder="how did it fit, feel, wear?"
              className="mt-2 block w-full resize-none rounded-xl border border-cocoa/20 bg-cream px-4 py-3 text-sm leading-6 text-charcoal outline-none transition duration-500 placeholder:text-charcoal/40 focus:border-cocoa"
            />
          </label>
        </div>

        {error ? (
          <p className="mt-3 text-xs lowercase text-burnt-red">{error}</p>
        ) : null}

        <div className="mt-6 flex gap-3">
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
            className="flex-1 rounded-2xl bg-maroon py-3 text-[11px] font-medium uppercase tracking-[0.24em] text-cream shadow-[0_18px_40px_rgba(74,31,31,0.22)] transition duration-500 hover:bg-maroon/90 disabled:opacity-50"
          >
            {pending
              ? "submitting…"
              : existingReview
                ? "update review"
                : "submit review"}
          </button>
        </div>
      </form>
    </div>
  );
}
