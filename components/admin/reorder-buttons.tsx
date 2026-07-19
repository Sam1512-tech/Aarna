"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

interface SortableItem {
  id: string;
  sortOrder: number;
}

/**
 * Up/down arrows that swap sortOrder with the adjacent row and call a
 * reorder action ({id, sortOrder}[]) — the same shape reorderCategories,
 * reorderBanners, etc. already take. `items` is the full list in its
 * current displayed order, not just the current row.
 */
export function ReorderButtons({
  items,
  id,
  action,
}: {
  items: SortableItem[];
  id: string;
  action: (items: { id: string; sortOrder: number }[]) => Promise<unknown>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const index = items.findIndex((i) => i.id === id);

  function swapWith(otherIndex: number) {
    if (pending || index === -1 || otherIndex < 0 || otherIndex >= items.length) {
      return;
    }
    const current = items[index];
    const other = items[otherIndex];
    startTransition(async () => {
      await action([
        { id: current.id, sortOrder: other.sortOrder },
        { id: other.id, sortOrder: current.sortOrder },
      ]);
      router.refresh();
    });
  }

  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={() => swapWith(index - 1)}
        disabled={pending || index <= 0}
        aria-label="Move up"
        className="flex h-9 w-9 items-center justify-center rounded-full border border-cocoa/20 bg-cream text-cocoa transition duration-300 hover:border-cocoa disabled:cursor-not-allowed disabled:opacity-30"
      >
        <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => swapWith(index + 1)}
        disabled={pending || index === -1 || index >= items.length - 1}
        aria-label="Move down"
        className="flex h-9 w-9 items-center justify-center rounded-full border border-cocoa/20 bg-cream text-cocoa transition duration-300 hover:border-cocoa disabled:cursor-not-allowed disabled:opacity-30"
      >
        <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
