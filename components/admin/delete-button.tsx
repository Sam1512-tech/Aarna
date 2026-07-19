"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { actionErrorMessage } from "@/lib/action-error";

/**
 * Drop-in delete action for an admin table row. Calls the given server
 * action, then refreshes the route so the row disappears — no client-side
 * list state to keep in sync. Confirms before firing (destructive + no undo).
 */
export function DeleteButton({
  action,
  id,
  confirmMessage,
  label,
}: {
  action: (id: string) => Promise<{ ok: true }>;
  id: string;
  confirmMessage: string;
  label: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleDelete() {
    if (!confirm(confirmMessage)) return;
    setError(null);
    startTransition(async () => {
      try {
        await action(id);
        router.refresh();
      } catch (err) {
        setError(actionErrorMessage(err, "couldn't delete"));
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleDelete}
        disabled={pending}
        aria-label={label}
        title={label}
        className="flex h-10 w-10 items-center justify-center rounded-full border border-burnt-red/25 bg-cream text-burnt-red transition duration-500 hover:bg-burnt-red/10 disabled:opacity-50"
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      {error ? (
        <p className="max-w-40 text-right text-[10px] text-burnt-red">
          {error}
        </p>
      ) : null}
    </div>
  );
}
