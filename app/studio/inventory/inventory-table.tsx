"use client";

import { useEffect, useState, useTransition } from "react";
import { X } from "lucide-react";
import { StatusPill, tableClasses } from "@/components/admin/admin-primitives";
import { adjustStock, getInventoryMovements } from "@/lib/actions/admin/inventory";
import { actionErrorMessage } from "@/lib/action-error";
import { useModalLock } from "@/hooks/use-modal-lock";

const LOW_STOCK_THRESHOLD = 5;

type Reason = "purchase" | "sale" | "return" | "adjustment" | "manual";
const REASONS: Reason[] = ["purchase", "return", "adjustment", "manual"];

interface Row {
  variantId: string;
  productTitle: string;
  size: string | null;
  color: string | null;
  sku: string;
  stock: number;
}

interface InventoryTableProps {
  items: Row[];
}

export function InventoryTable({ items: initial }: InventoryTableProps) {
  const [rows, setRows] = useState(initial);
  const [openRow, setOpenRow] = useState<Row | null>(null);
  const [historyRow, setHistoryRow] = useState<Row | null>(null);
  const t = tableClasses();

  // Keep local state in sync when the parent re-renders after filter/search.
  // Setting state during render (not in an effect) lets React restart the
  // render immediately instead of painting a stale frame first.
  const [prevInitial, setPrevInitial] = useState(initial);
  if (prevInitial !== initial) {
    setPrevInitial(initial);
    setRows(initial);
  }

  function handleAdjusted(variantId: string, newStock: number) {
    setRows((prev) =>
      prev.map((r) => (r.variantId === variantId ? { ...r, stock: newStock } : r)),
    );
    setOpenRow(null);
  }

  return (
    <>
      <div className={t.wrapper}>
        <table className={t.table}>
          <thead className={t.thead}>
            <tr>
              <th className={t.th}>product</th>
              <th className={t.th}>variant</th>
              <th className={t.th}>sku</th>
              <th className={t.th}>stock</th>
              <th className={t.th}>status</th>
              <th className={t.th}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const low = row.stock <= LOW_STOCK_THRESHOLD;
              const out = row.stock === 0;
              return (
                <tr key={row.variantId} className={t.tr}>
                  <td className={t.td}>
                    <p className="text-charcoal">{row.productTitle}</p>
                  </td>
                  <td className={t.td}>
                    {[row.size, row.color].filter(Boolean).join(" / ") || "—"}
                  </td>
                  <td className={`${t.td} font-mono text-xs`}>{row.sku}</td>
                  <td className={t.td}>
                    <span
                      className={`font-medium tabular-nums ${
                        out || low ? "text-burnt-red" : "text-charcoal"
                      }`}
                    >
                      {row.stock}
                    </span>
                  </td>
                  <td className={t.td}>
                    {out ? (
                      <StatusPill label="Out of stock" tone="bad" />
                    ) : low ? (
                      <StatusPill label="Low" tone="warn" />
                    ) : (
                      <StatusPill label="Ok" tone="ok" />
                    )}
                  </td>
                  <td className={`${t.td} text-right`}>
                    <div className="flex items-center justify-end gap-3">
                      <button
                        type="button"
                        onClick={() => setHistoryRow(row)}
                        className="soft-link text-[11px] font-bold uppercase tracking-[0.18em] text-cocoa"
                      >
                        history
                      </button>
                      <button
                        type="button"
                        onClick={() => setOpenRow(row)}
                        className="soft-link text-[11px] font-bold uppercase tracking-[0.18em] text-cocoa"
                      >
                        adjust
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {openRow ? (
        <AdjustModal
          row={openRow}
          onClose={() => setOpenRow(null)}
          onAdjusted={handleAdjusted}
        />
      ) : null}

      {historyRow ? (
        <HistoryModal row={historyRow} onClose={() => setHistoryRow(null)} />
      ) : null}
    </>
  );
}

function HistoryModal({ row, onClose }: { row: Row; onClose: () => void }) {
  useModalLock(true, onClose);
  const [movements, setMovements] = useState<Awaited<
    ReturnType<typeof getInventoryMovements>
  > | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getInventoryMovements({ variantId: row.variantId, pageSize: 50 })
      .then((rows) => {
        if (!cancelled) setMovements(rows);
      })
      .catch((err) => {
        if (!cancelled) setError(actionErrorMessage(err, "Couldn't load history"));
      });
    return () => {
      cancelled = true;
    };
  }, [row.variantId]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal/40 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="history-title"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute inset-0 cursor-default"
      />
      <div className="relative z-10 w-full max-h-[85vh] max-w-lg overflow-y-auto rounded-2xl border border-cocoa/12 bg-cream p-6 shadow-[0_28px_70px_rgba(43,38,35,0.24)]">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-charcoal/55">
              stock history
            </p>
            <h3 id="history-title" className="mt-1 truncate font-display text-xl uppercase text-maroon">
              {row.productTitle}
            </h3>
            <p className="text-xs text-charcoal/55">
              {[row.size, row.color].filter(Boolean).join(" / ") || "—"} · SKU{" "}
              {row.sku}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-cocoa transition duration-500 hover:bg-cocoa/10"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-5">
          {error ? (
            <p className="text-xs text-burnt-red">{error}</p>
          ) : movements === null ? (
            <p className="text-sm text-charcoal/55">Loading…</p>
          ) : movements.length === 0 ? (
            <p className="text-sm text-charcoal/55">
              No stock movements recorded for this variant yet.
            </p>
          ) : (
            <ul className="divide-y divide-cocoa/8">
              {movements.map((m) => (
                <li key={m.id} className="flex items-start justify-between gap-4 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="text-charcoal">
                      {m.reason}
                      {m.referenceId ? ` · ${m.referenceId}` : ""}
                    </p>
                    {m.note ? (
                      <p className="mt-0.5 text-xs text-charcoal/55">{m.note}</p>
                    ) : null}
                    <p className="mt-0.5 text-xs text-charcoal/45">
                      {new Date(m.createdAt).toLocaleString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: true,
                        timeZone: "Asia/Kolkata",
                      })}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 font-medium tabular-nums ${
                      m.delta < 0 ? "text-burnt-red" : "text-cocoa"
                    }`}
                  >
                    {m.delta > 0 ? `+${m.delta}` : m.delta}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function AdjustModal({
  row,
  onClose,
  onAdjusted,
}: {
  row: Row;
  onClose: () => void;
  onAdjusted: (variantId: string, newStock: number) => void;
}) {
  const [deltaStr, setDeltaStr] = useState("");
  const [reason, setReason] = useState<Reason>("purchase");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  useModalLock(true, onClose);

  const delta = Number.parseInt(deltaStr, 10);
  const deltaValid = Number.isInteger(delta) && delta !== 0;
  const projected = deltaValid ? row.stock + delta : row.stock;
  const wouldGoNegative = deltaValid && projected < 0;
  const canSubmit = deltaValid && !wouldGoNegative && !pending;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    startTransition(async () => {
      try {
        await adjustStock({
          variantId: row.variantId,
          delta,
          reason,
          note: note.trim() || undefined,
        });
        onAdjusted(row.variantId, projected);
      } catch (err) {
        setError(actionErrorMessage(err, "Couldn't adjust stock"));
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal/40 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="adjust-title"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute inset-0 cursor-default"
      />
      <div className="relative z-10 w-full max-h-[85vh] max-w-md overflow-y-auto rounded-2xl border border-cocoa/12 bg-cream p-6 shadow-[0_28px_70px_rgba(43,38,35,0.24)]">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-charcoal/55">
              adjust stock
            </p>
            <h3
              id="adjust-title"
              className="mt-1 truncate font-display text-xl uppercase text-maroon"
            >
              {row.productTitle}
            </h3>
            <p className="text-xs text-charcoal/55">
              {[row.size, row.color].filter(Boolean).join(" / ") || "—"} · SKU{" "}
              {row.sku} · currently {row.stock}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-cocoa transition duration-500 hover:bg-cocoa/10"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4" noValidate>
          <label className="block">
            <span className="block text-[11px] font-medium uppercase tracking-[0.16em] text-charcoal/55">
              change (+/−)
            </span>
            <input
              // No inputMode="numeric" — that keypad has no minus key on iOS/
              // Android, which would make it impossible to enter a negative
              // delta (removing stock) from a phone. Default keyboard still
              // includes digits.
              value={deltaStr}
              onChange={(e) => setDeltaStr(e.target.value.replace(/[^\d-]/g, ""))}
              placeholder="e.g. 12 or -3"
              autoFocus
              className="mt-1.5 block w-full rounded-xl border border-cocoa/20 bg-cream px-4 py-2.5 text-base text-charcoal outline-none transition duration-500 focus:border-cocoa sm:text-sm"
            />
            {deltaValid ? (
              <p
                className={`mt-1 text-xs ${
                  wouldGoNegative ? "text-burnt-red" : "text-charcoal/55"
                }`}
              >
                {wouldGoNegative
                  ? `Would drop stock below zero (would be ${projected})`
                  : `New stock will be ${projected}`}
              </p>
            ) : (
              <p className="mt-1 text-xs text-charcoal/55">
                Positive to restock, negative to remove. Never zero.
              </p>
            )}
          </label>

          <label className="block">
            <span className="block text-[11px] font-medium uppercase tracking-[0.16em] text-charcoal/55">
              reason
            </span>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as Reason)}
              className="mt-1.5 block w-full rounded-xl border border-cocoa/20 bg-cream px-4 py-2.5 text-base text-charcoal outline-none transition duration-500 focus:border-cocoa sm:text-sm"
            >
              {REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="block text-[11px] font-medium uppercase tracking-[0.16em] text-charcoal/55">
              note (optional)
            </span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. new stock delivered — batch 4"
              className="mt-1.5 block w-full rounded-xl border border-cocoa/20 bg-cream px-4 py-2.5 text-base text-charcoal outline-none transition duration-500 focus:border-cocoa sm:text-sm"
            />
          </label>

          {error ? (
            <p className="text-xs text-burnt-red">{error}</p>
          ) : null}

          <div className="mt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center rounded-full border border-cocoa/22 bg-cream px-4 py-2 text-[11px] font-medium uppercase tracking-[0.18em] text-cocoa transition duration-500 hover:border-cocoa"
            >
              cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="inline-flex items-center gap-2 rounded-full bg-cocoa px-5 py-2 text-[11px] font-medium uppercase tracking-[0.18em] text-cream shadow-[0_10px_28px_rgba(140,106,90,0.22)] transition duration-500 hover:bg-cocoa/90 disabled:opacity-50"
            >
              {pending ? "saving…" : "apply"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
