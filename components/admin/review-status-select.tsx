"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updateReviewStatus } from "@/lib/actions/admin/reviews";
import { actionErrorMessage } from "@/lib/action-error";

const STATUSES = ["pending", "approved", "rejected"] as const;
type ReviewStatus = (typeof STATUSES)[number];

const TONE_CLASS: Record<ReviewStatus, string> = {
  approved: "border-cocoa/25 bg-cocoa/8 text-cocoa",
  rejected: "border-burnt-red/25 bg-burnt-red/8 text-burnt-red",
  pending: "border-cocoa/15 bg-cream text-charcoal/60",
};

/**
 * Replaces the static status pill with a live control — changing it calls
 * updateReviewStatus immediately (no separate save step). Optimistic update,
 * rolled back on failure.
 */
export function ReviewStatusSelect({
  reviewId,
  status,
}: {
  reviewId: string;
  status: ReviewStatus;
}) {
  const router = useRouter();
  const [current, setCurrent] = useState<ReviewStatus>(status);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleChange(next: ReviewStatus) {
    if (next === current) return;
    const previous = current;
    setCurrent(next);
    setError(null);
    startTransition(async () => {
      try {
        await updateReviewStatus(reviewId, next);
        router.refresh();
      } catch (err) {
        setCurrent(previous);
        setError(actionErrorMessage(err, "couldn't update status"));
      }
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <select
        value={current}
        disabled={pending}
        onChange={(e) => handleChange(e.target.value as ReviewStatus)}
        aria-label="review status"
        className={`rounded-full border px-3 py-1 text-base font-medium uppercase tracking-[0.16em] outline-none transition duration-300 focus-visible:ring-2 focus-visible:ring-cocoa/40 disabled:opacity-50 sm:text-[10px] ${TONE_CLASS[current]}`}
      >
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      {error ? (
        <p className="max-w-32 text-[10px] text-burnt-red">{error}</p>
      ) : null}
    </div>
  );
}
