import { Star } from "lucide-react";
import type { DisplayReview } from "@/lib/actions/reviews";

function fmtDate(d: Date | string) {
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// First name only — full names aren't shown on a public page.
function displayName(name: string | null): string {
  if (!name) return "verified buyer";
  return name.trim().split(/\s+/)[0];
}

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`h-3.5 w-3.5 ${
            n <= rating ? "fill-cocoa text-cocoa" : "fill-transparent text-cocoa/25"
          }`}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}

export function ProductReviews({
  average,
  count,
  reviews,
}: {
  average: number;
  count: number;
  reviews: DisplayReview[];
}) {
  if (count === 0) return null;

  return (
    <section id="reviews" className="bg-cream px-5 pb-24 md:px-6 md:pb-32">
      <div className="mx-auto max-w-7xl border-t border-cocoa/12 pt-14 md:pt-20">
        <div className="flex flex-wrap items-end justify-between gap-5 pb-10">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.24em] text-cocoa">
              Reviews
            </p>
            <div className="mt-3 flex items-center gap-3">
              <Stars rating={Math.round(average)} />
              <span className="font-display text-3xl text-maroon">
                {average.toFixed(1)}
              </span>
              <span className="text-sm text-charcoal/55">
                from {count} {count === 1 ? "review" : "reviews"}
              </span>
            </div>
          </div>
        </div>

        <ul className="grid gap-x-8 gap-y-8 border-t border-cocoa/8 pt-8 sm:grid-cols-2">
          {reviews.map((r) => (
            <li key={r.id} className="border-b border-cocoa/8 pb-8">
              <div className="flex items-center justify-between gap-4">
                <Stars rating={r.rating} />
                <span className="text-xs text-charcoal/50">
                  {fmtDate(r.createdAt)}
                </span>
              </div>
              {r.body ? (
                <p className="mt-3 text-sm leading-7 text-charcoal/80">
                  {r.body}
                </p>
              ) : null}
              <p className="mt-3 text-xs font-medium uppercase tracking-[0.16em] text-charcoal/55">
                {displayName(r.customerName)}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
