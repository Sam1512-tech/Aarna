"use client";

import { useRef, useState } from "react";
import { Minus, Plus, Printer, ScanLine, X } from "lucide-react";
import { AdminCard } from "@/components/admin/admin-primitives";
import { getVariantBySku } from "@/lib/actions/admin/inventory";
import { actionErrorMessage } from "@/lib/action-error";

interface QueueItem {
  variantId: string;
  productTitle: string;
  size: string | null;
  color: string | null;
  sku: string;
  quantity: number;
}

/**
 * Scan-to-reprint: for a damaged/missing tag on the floor. A USB barcode
 * scanner just types the SKU + Enter into an autofocused input — same
 * pattern as the inventory search box. Scanning the same SKU again bumps
 * its quantity, so walking a rack and re-scanning each damaged tag builds
 * up exactly the reprint counts needed before one print.
 *
 * Not scoped to one product (unlike the per-product tag panel) — a scanned
 * SKU can belong to any of the catalog's products.
 */
export function ReprintScanPanel() {
  const [sku, setSku] = useState("");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [looking, setLooking] = useState(false);
  const [printing, setPrinting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // A real barcode scanner can emit a full SKU + Enter well under the ~120-
  // 280ms a lookup takes, so scans are queued and processed one at a time
  // instead of disabling the input mid-lookup (which would silently drop
  // whatever the operator scanned next).
  const pendingRef = useRef<string[]>([]);
  const processingRef = useRef(false);

  async function processPending() {
    if (processingRef.current) return;
    processingRef.current = true;
    setLooking(true);
    while (pendingRef.current.length > 0) {
      const value = pendingRef.current.shift()!;
      try {
        const match = await getVariantBySku(value);
        if (!match) {
          setError(`no variant found for SKU "${value}"`);
        } else {
          setError(null);
          setQueue((q) => {
            const existing = q.find((item) => item.variantId === match.variantId);
            if (existing) {
              return q.map((item) =>
                item.variantId === match.variantId
                  ? { ...item, quantity: item.quantity + 1 }
                  : item,
              );
            }
            return [
              ...q,
              {
                variantId: match.variantId,
                productTitle: match.productTitle,
                size: match.size,
                color: match.color,
                sku: match.sku,
                quantity: 1,
              },
            ];
          });
        }
      } catch (err) {
        setError(actionErrorMessage(err, "couldn't look up that SKU"));
      }
    }
    processingRef.current = false;
    setLooking(false);
    inputRef.current?.focus();
  }

  function handleScan(e: React.FormEvent) {
    e.preventDefault();
    const value = sku.trim();
    if (!value) return;
    // Clear immediately (not in a .finally()) so the input is ready to
    // receive the next scan right away, even while this one is still
    // looking up.
    setSku("");
    pendingRef.current.push(value);
    void processPending();
  }

  function bump(variantId: string, delta: number) {
    setQueue((q) =>
      q
        .map((item) =>
          item.variantId === variantId
            ? { ...item, quantity: Math.max(1, item.quantity + delta) }
            : item,
        )
        .filter(Boolean),
    );
  }

  function remove(variantId: string) {
    setQueue((q) => q.filter((item) => item.variantId !== variantId));
  }

  async function handlePrint() {
    if (queue.length === 0) return;
    setPrinting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/hang-tags/print", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: queue.map((item) => ({
            variantId: item.variantId,
            quantity: item.quantity,
          })),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "couldn't generate tags");
      }
      const blob = await res.blob();
      window.open(URL.createObjectURL(blob), "_blank");
      setQueue([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "couldn't generate tags");
    } finally {
      setPrinting(false);
      inputRef.current?.focus();
    }
  }

  const totalCopies = queue.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <AdminCard>
      <div className="flex items-center gap-2 border-b border-cocoa/10 pb-4">
        <ScanLine className="h-5 w-5 text-cocoa" aria-hidden="true" />
        <h2 className="font-display text-xl uppercase text-maroon">
          reprint tags
        </h2>
      </div>
      <p className="mt-3 text-sm text-charcoal/60">
        Scan a damaged or missing tag&rsquo;s barcode — it&rsquo;ll queue up
        for reprint. Scan the same tag again to add another copy.
      </p>

      <form onSubmit={handleScan} className="mt-4 flex gap-2">
        <input
          ref={inputRef}
          value={sku}
          onChange={(e) => setSku(e.target.value)}
          placeholder="scan or type sku…"
          className="flex-1 rounded-xl border border-cocoa/20 bg-cream px-4 py-2.5 text-base text-charcoal outline-none transition duration-500 focus:border-cocoa disabled:opacity-60 sm:text-sm"
        />
        <button
          type="submit"
          disabled={!sku.trim()}
          className="rounded-full bg-cocoa px-4 py-2 text-[11px] font-medium uppercase tracking-[0.16em] text-cream transition duration-500 hover:bg-cocoa/90 disabled:opacity-50"
        >
          {looking ? "…" : "add"}
        </button>
      </form>
      {error ? <p className="mt-2 text-xs text-burnt-red">{error}</p> : null}

      {queue.length > 0 ? (
        <>
          <ul className="mt-4 divide-y divide-cocoa/10">
            {queue.map((item) => (
              <li
                key={item.variantId}
                className="flex items-center gap-3 py-2.5"
              >
                <div className="min-w-0 flex-1 text-sm">
                  <p className="truncate text-charcoal">{item.productTitle}</p>
                  <p className="text-xs text-charcoal/50">
                    {[item.size, item.color].filter(Boolean).join(" / ") || "—"}{" "}
                    <span className="font-mono">{item.sku}</span>
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => bump(item.variantId, -1)}
                    aria-label={`decrease copies of ${item.sku}`}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-cocoa/20 text-cocoa transition duration-300 hover:bg-cocoa/8"
                  >
                    <Minus className="h-3 w-3" aria-hidden="true" />
                  </button>
                  <span className="w-6 text-center text-sm tabular-nums">
                    {item.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => bump(item.variantId, 1)}
                    aria-label={`increase copies of ${item.sku}`}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-cocoa/20 text-cocoa transition duration-300 hover:bg-cocoa/8"
                  >
                    <Plus className="h-3 w-3" aria-hidden="true" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => remove(item.variantId)}
                  aria-label={`remove ${item.sku} from queue`}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full text-cocoa/50 transition duration-300 hover:bg-burnt-red/10 hover:text-burnt-red"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={handlePrint}
            disabled={printing}
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-cocoa px-5 py-2.5 text-[11px] font-medium uppercase tracking-[0.18em] text-cream shadow-[0_10px_28px_rgba(140,106,90,0.22)] transition duration-500 hover:bg-cocoa/90 disabled:opacity-50"
          >
            <Printer className="h-3.5 w-3.5" aria-hidden="true" />
            {printing ? "generating…" : `print ${totalCopies} tag${totalCopies === 1 ? "" : "s"}`}
          </button>
        </>
      ) : null}
    </AdminCard>
  );
}
