"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Printer } from "lucide-react";
import { StatusPill, tableClasses } from "@/components/admin/admin-primitives";
import type { AdminOrderListItem } from "@/lib/actions/admin/orders";
import { formatINR } from "@/lib/utils";

// Admin dates render in IST regardless of the server clock — see the note in
// app/studio/orders/page.tsx (this dupes the tiny formatter rather than
// importing across the server/client boundary for one function).
function fmtDate(d: Date | string | null) {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  });
}

/**
 * Orders list + "print selected invoices" — checkbox per row (only orders
 * with an invoice number are selectable; unpaid orders have nothing to
 * print), a header checkbox to select every eligible row on this page, and a
 * sticky action bar that posts the selection to
 * /api/admin/orders/invoices/print and opens the merged PDF in a new tab —
 * same pattern as the hang-tag reprint queue on /studio/inventory.
 *
 * Selection is scoped to the current page's rows only — paging away resets
 * it, matching the page-at-a-time queues used elsewhere in admin rather than
 * trying to persist a cross-page selection.
 */
export function OrdersTable({ items }: { items: AdminOrderListItem[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const t = tableClasses();
  const printable = useMemo(() => items.filter((o) => o.invoiceNumber), [items]);
  const allSelected = printable.length > 0 && printable.every((o) => selected.has(o.id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(printable.map((o) => o.id)));
  }

  async function handlePrint() {
    if (selected.size === 0) return;
    setPrinting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/orders/invoices/print", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderIds: [...selected] }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Couldn't generate invoices");
      }
      const blob = await res.blob();
      window.open(URL.createObjectURL(blob), "_blank");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't generate invoices");
    } finally {
      setPrinting(false);
    }
  }

  return (
    <div>
      {error ? (
        <p role="alert" className="mb-3 text-xs text-burnt-red">
          {error}
        </p>
      ) : null}

      <div className={t.wrapper}>
        <table className={t.table}>
          <thead className={t.thead}>
            <tr>
              <th className={t.th}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  disabled={printable.length === 0}
                  aria-label="Select all orders with an invoice on this page"
                  className="h-4 w-4 rounded border-cocoa/30 accent-cocoa disabled:opacity-40"
                />
              </th>
              <th className={t.th}>order</th>
              <th className={t.th}>placed</th>
              <th className={t.th}>customer</th>
              <th className={t.th}>total</th>
              <th className={t.th}>payment</th>
              <th className={t.th}>fulfillment</th>
              <th className={t.th}></th>
            </tr>
          </thead>
          <tbody>
            {items.map((o) => (
              <tr key={o.id} className={t.tr}>
                <td className={t.td}>
                  <input
                    type="checkbox"
                    checked={selected.has(o.id)}
                    onChange={() => toggle(o.id)}
                    disabled={!o.invoiceNumber}
                    aria-label={
                      o.invoiceNumber
                        ? `Select order ${o.orderNumber} for printing`
                        : `Order ${o.orderNumber} has no invoice yet`
                    }
                    title={o.invoiceNumber ? undefined : "No invoice yet — payment not captured"}
                    className="h-4 w-4 rounded border-cocoa/30 accent-cocoa disabled:opacity-30"
                  />
                </td>
                <td className={t.td}>
                  <p className="font-medium text-charcoal">{o.orderNumber}</p>
                </td>
                <td className={t.td}>{fmtDate(o.createdAt)}</td>
                <td className={t.td}>
                  <p className="text-charcoal">{o.email}</p>
                  {o.phone ? (
                    <p className="text-xs text-charcoal/72">{o.phone}</p>
                  ) : null}
                </td>
                <td className={t.td}>{formatINR(o.total)}</td>
                <td className={t.td}>
                  <StatusPill
                    label={o.paymentStatus.replaceAll("_", " ")}
                    tone={
                      o.paymentStatus === "paid"
                        ? "ok"
                        : o.paymentStatus === "failed"
                          ? "bad"
                          : "muted"
                    }
                  />
                </td>
                <td className={t.td}>
                  <StatusPill
                    label={o.fulfillmentStatus.replaceAll("_", " ")}
                    tone={
                      o.fulfillmentStatus === "delivered"
                        ? "ok"
                        : o.fulfillmentStatus === "cancelled"
                          ? "bad"
                          : "muted"
                    }
                  />
                </td>
                <td className={t.td}>
                  <Link
                    href={`/studio/orders/${o.orderNumber}`}
                    className="soft-link text-[11px] font-bold uppercase tracking-[0.16em] text-cocoa"
                  >
                    open
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* aria-live container stays mounted regardless of selection state so
          assistive tech has already registered it as a live region by the
          time the bar's content appears/changes — a live region that mounts
          and gets its content in the same paint isn't reliably announced. */}
      <div aria-live="polite" aria-atomic="true">
        {selected.size > 0 ? (
          <div className="sticky bottom-4 z-10 mt-4 flex items-center justify-between gap-3 rounded-full border border-cocoa/15 bg-cream px-5 py-3 shadow-[0_10px_28px_rgba(43,38,35,0.12)]">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-charcoal/72">
              {selected.size} invoice{selected.size === 1 ? "" : "s"} selected
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="text-[11px] font-medium uppercase tracking-[0.16em] text-charcoal/72 transition duration-300 hover:text-charcoal"
              >
                clear
              </button>
              <button
                type="button"
                onClick={handlePrint}
                disabled={printing}
                className="inline-flex items-center gap-2 rounded-full bg-cocoa px-5 py-2.5 text-[11px] font-medium uppercase tracking-[0.18em] text-cream shadow-[0_10px_28px_rgba(140,106,90,0.22)] transition duration-500 hover:bg-cocoa/90 disabled:opacity-50"
              >
                <Printer className="h-3.5 w-3.5" aria-hidden="true" />
                {printing ? "generating…" : "print invoices"}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
