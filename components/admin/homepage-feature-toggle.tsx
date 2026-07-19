"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Star } from "lucide-react";
import { setHomepageFeatureCollection } from "@/lib/actions/admin/collections";
import { actionErrorMessage } from "@/lib/action-error";

/**
 * Toggles a collection's "show on homepage" flag. At most one collection can
 * be featured — turning this on for one silently turns it off for any other
 * (server-enforced), so the whole table refreshes on toggle rather than
 * flipping just the clicked row.
 */
export function HomepageFeatureToggle({
  id,
  name,
  featured,
}: {
  id: string;
  name: string;
  featured: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    setError(null);
    startTransition(async () => {
      try {
        await setHomepageFeatureCollection(id, !featured);
        router.refresh();
      } catch (err) {
        setError(actionErrorMessage(err, "couldn't update"));
      }
    });
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-pressed={featured}
        aria-label={
          featured
            ? `Stop featuring "${name}" on the homepage`
            : `Feature "${name}" on the homepage`
        }
        title={
          featured ? "Featured on homepage — click to unfeature" : "Feature on homepage"
        }
        className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-2.5 py-2 text-[10px] font-medium uppercase tracking-[0.14em] transition duration-500 disabled:opacity-50 ${
          featured
            ? "border-cocoa bg-cocoa/12 text-cocoa"
            : "border-cocoa/20 bg-cream text-charcoal/50 hover:border-cocoa/40"
        }`}
      >
        <Star
          className="h-3 w-3"
          aria-hidden="true"
          fill={featured ? "currentColor" : "none"}
        />
        {featured ? "featured" : "feature"}
      </button>
      {error ? <p className="text-[10px] text-burnt-red">{error}</p> : null}
    </div>
  );
}
