import type { Metadata } from "next";
import Link from "next/link";
import {
  AdminCard,
  AdminEmpty,
  AdminPageHeader,
} from "@/components/admin/admin-primitives";
import { AutoSubmitForm } from "@/components/admin/auto-submit-form";
import { Pagination } from "@/components/admin/pagination";
import { ReturnStatusSelect } from "@/components/admin/return-status-select";
import { ReturnPhotoGrid } from "@/components/admin/return-photo-grid";
import { ReturnQcTrigger } from "@/components/admin/return-qc-trigger";
import { RecordExternalRefundTrigger } from "@/components/admin/record-external-refund-trigger";
import { ShipExchangeTrigger } from "@/components/admin/ship-exchange-trigger";
import { RecordCodRefundTrigger } from "@/components/admin/record-cod-refund-trigger";
import { REJECT_REASONS } from "@/lib/returns/reject-reasons";
import { getAdminReturns } from "@/lib/actions/admin/returns";
import { formatINR } from "@/lib/utils";

export const metadata: Metadata = { title: "Admin · Returns" };

const STATUSES = [
  "requested",
  "approved",
  "rejected",
  "picked",
  "received",
  "refund_pending",
  "refunded",
  "exchange_shipped",
  "exchange_delivered",
] as const;
type ReturnStatus = (typeof STATUSES)[number];

const TYPES = ["all", "return", "exchange"] as const;
type TypeFilter = (typeof TYPES)[number];

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const STALE_THRESHOLD_HOURS = 24; // Anything unresolved past this shows an aging flag.

// Vercel functions default to UTC even in bom1 — pin every admin date to IST
// so timestamps never drift by up to 5:30 h relative to what the client sees
// on their phone clock.
function fmtDateTime(d: Date | string | null) {
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

function hoursSince(d: Date | string): number {
  const t = typeof d === "string" ? new Date(d).getTime() : d.getTime();
  return (Date.now() - t) / (MS_PER_DAY / 24);
}

const CATEGORY_LABEL: Record<string, string> = {
  size_fit: "Size or fit",
  quality: "Quality issue",
  damaged: "Arrived damaged",
  wrong_item: "Wrong item sent",
  changed_mind: "Changed mind",
  color: "Different colour",
  style: "Different style",
};

const REJECT_REASON_LABEL: Record<string, string> = Object.fromEntries(
  REJECT_REASONS.map((r) => [r.value, r.label]),
);

export default async function AdminReturnsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; type?: string; page?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const status = (STATUSES as readonly string[]).includes(params.status ?? "")
    ? (params.status as ReturnStatus)
    : undefined;
  const typeFilter: TypeFilter = (TYPES as readonly string[]).includes(
    params.type ?? "",
  )
    ? (params.type as TypeFilter)
    : "all";

  // One query, filtered by status only — type is filtered client-side from
  // this same batch so the tab counts stay a single round-trip (the dev
  // pooler is prone to timing out extra queries; splitting counts into
  // separate calls silently showed "0" on a transient failure instead of
  // real data). Fine at launch scale (pageSize covers the full queue).
  const result = await getAdminReturns({
    status,
    page,
    pageSize: 60,
  }).catch(() => ({ items: [], total: 0, page: 1, pageSize: 60 }));

  // Paginated by status only (see the comment above) — a type filter narrows
  // what's shown per page without changing the page boundaries themselves,
  // same tradeoff "· {total} total across all types" already documented.
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));

  const enriched = result.items.map((r) => ({ ...r, reasonClean: r.reason }));

  const filtered =
    typeFilter === "all"
      ? enriched
      : enriched.filter((r) => r.type === typeFilter);

  const counts = {
    all: enriched.length,
    returns: enriched.filter((r) => r.type === "return").length,
    exchanges: enriched.filter((r) => r.type === "exchange").length,
    stale: enriched.filter(
      (r) => r.status === "requested" && hoursSince(r.createdAt) > STALE_THRESHOLD_HOURS,
    ).length,
  };

  return (
    <div>
      <AdminPageHeader
        eyebrow="Commerce"
        title="Returns & exchanges"
        intro="Return + exchange requests raised by customers within the 3-day window. Change status inline; the customer sees their timeline update in real time."
      />

      {counts.stale > 0 ? (
        <div className="mt-6 flex items-center gap-3 rounded-2xl border border-burnt-red/25 bg-burnt-red/6 px-4 py-3">
          <span className="inline-flex h-2 w-2 rounded-full bg-burnt-red" />
          <p className="text-sm text-charcoal/75">
            <span className="font-medium text-burnt-red">{counts.stale}</span>{" "}
            request{counts.stale === 1 ? "" : "s"} waiting more than 24 hours —
            customer expects a decision within the day.
          </p>
        </div>
      ) : null}

      {/* Type + status filters — one row, matching the label+select pattern
          used by every other admin list page (Orders, Products). Keyed to
          the current filter values so a <Link>-driven navigation (e.g.
          "Clear") always remounts these <select>s with a fresh defaultValue
          — a native <select>'s defaultValue only applies on mount, so
          without this key a soft client-side navigation left the dropdown
          showing its last user-picked value even after the URL (and the
          actual filtered results) had already reset. */}
      <AutoSubmitForm
        key={`${typeFilter}-${status ?? "all"}`}
        className="mt-6 flex flex-wrap items-end gap-3"
      >
        <label>
          <span className="block text-[11px] font-medium uppercase tracking-[0.16em] text-charcoal/72">
            Type
          </span>
          <select
            name="type"
            defaultValue={typeFilter}
            className="mt-1.5 block rounded-xl border border-cocoa/20 bg-cream px-4 py-2.5 text-base text-charcoal outline-none transition duration-500 focus:border-cocoa sm:text-sm"
          >
            <option value="all">All types · {counts.all}</option>
            <option value="return">Returns · {counts.returns}</option>
            <option value="exchange">Exchanges · {counts.exchanges}</option>
          </select>
        </label>
        <label>
          <span className="block text-[11px] font-medium uppercase tracking-[0.16em] text-charcoal/72">
            Status
          </span>
          <select
            name="status"
            defaultValue={status ?? ""}
            className="mt-1.5 block rounded-xl border border-cocoa/20 bg-cream px-4 py-2.5 text-base text-charcoal outline-none transition duration-500 focus:border-cocoa sm:text-sm"
          >
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        {status || typeFilter !== "all" ? (
          <Link
            href="/studio/returns"
            className="pb-2.5 text-[11px] font-medium uppercase tracking-[0.16em] text-charcoal/55 transition hover:text-cocoa"
          >
            Clear
          </Link>
        ) : null}
      </AutoSubmitForm>

      <div className="mt-6">
        {filtered.length === 0 ? (
          <AdminEmpty
            title="No requests match"
            description="The queue is clear for this filter."
          />
        ) : (
          <ul className="space-y-4">
            {filtered.map((r) => {
              const isStale =
                r.status === "requested" &&
                hoursSince(r.createdAt) > STALE_THRESHOLD_HOURS;
              return (
                <li key={r.id}>
                <AdminCard>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] ${
                            r.type === "exchange"
                              ? "border-cocoa/30 bg-cocoa/8 text-cocoa"
                              : "border-maroon/25 bg-maroon/6 text-maroon"
                          }`}
                        >
                          {r.type}
                        </span>
                        {r.paymentMethod === "cod" ? (
                          <span className="rounded-full border border-cocoa/25 bg-cocoa/6 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-cocoa">
                            COD
                          </span>
                        ) : null}
                        <Link
                          href={`/studio/orders/${r.orderId}`}
                          className="soft-link text-[11px] font-medium uppercase tracking-[0.16em] text-charcoal/60"
                        >
                          Order · {r.orderNumber}
                        </Link>
                        {isStale ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-burnt-red/25 bg-burnt-red/6 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-burnt-red">
                            <span className="h-1.5 w-1.5 rounded-full bg-burnt-red" />
                            {Math.round(hoursSince(r.createdAt))}h waiting
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-2 font-display text-xl leading-tight text-maroon">
                        {r.productTitle}
                      </p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-charcoal/55">
                        {r.variantLabel ? <span>{r.variantLabel}</span> : null}
                        {r.sku ? (
                          <span className="rounded bg-cocoa/6 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-charcoal/70">
                            {r.sku}
                          </span>
                        ) : null}
                      </div>
                      {r.type === "exchange" ? (
                        <p className="mt-2 text-xs text-charcoal/65">
                          <span className="text-charcoal/45">Wants </span>
                          {r.desiredProductTitle ? (
                            <>
                              {r.desiredProductTitle}
                              {r.desiredSize || r.desiredColor
                                ? ` · ${[r.desiredSize, r.desiredColor].filter(Boolean).join(" / ")}`
                                : ""}
                              {" — "}
                              <span
                                className={
                                  (r.desiredStock ?? 0) <= 0
                                    ? "font-medium text-burnt-red"
                                    : "text-charcoal/65"
                                }
                              >
                                {(r.desiredStock ?? 0) <= 0
                                  ? "Out of stock"
                                  : `${r.desiredStock} in stock`}
                              </span>
                            </>
                          ) : (
                            "Not picked yet"
                          )}
                        </p>
                      ) : null}
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <ReturnStatusSelect
                        returnId={r.id}
                        status={r.status as ReturnStatus}
                      />
                      {r.refundAmount ? (
                        <p className="text-right text-sm">
                          <span className="text-charcoal/55">Refund </span>
                          <span className="font-medium text-cocoa">
                            {formatINR(r.refundAmount)}
                          </span>
                        </p>
                      ) : null}
                    </div>
                  </div>

                  {/* Reason */}
                  <div className="mt-4 rounded-xl border border-cocoa/10 bg-cocoa/4 px-4 py-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-charcoal/55">
                        Customer note
                      </p>
                      {r.reasonCategory ? (
                        <span className="rounded-full bg-cocoa/8 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-cocoa">
                          {CATEGORY_LABEL[r.reasonCategory] ?? r.reasonCategory}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1.5 whitespace-pre-wrap text-sm leading-6 text-charcoal/80">
                      {r.reasonClean || "—"}
                    </p>
                  </div>

                  <ReturnPhotoGrid photos={r.photos} />

                  {r.status === "rejected" && r.rejectionReason ? (
                    <div className="mt-4 rounded-xl border border-burnt-red/20 bg-burnt-red/4 px-4 py-3">
                      <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-burnt-red">
                        Rejected · {REJECT_REASON_LABEL[r.rejectionReason] ?? r.rejectionReason}
                      </p>
                      {r.adminNote ? (
                        <p className="mt-1.5 whitespace-pre-wrap text-sm leading-6 text-charcoal/70">
                          {r.adminNote}
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {r.status === "received" ? (
                    <>
                      <ReturnQcTrigger
                        returnId={r.id}
                        refundAmount={r.refundAmount ?? r.lineTotal}
                        type={r.type as "return" | "exchange"}
                      />
                      {r.type === "return" ? (
                        <RecordExternalRefundTrigger
                          returnId={r.id}
                          refundAmount={r.refundAmount ?? r.lineTotal}
                        />
                      ) : null}
                    </>
                  ) : null}

                  {r.status === "refund_pending" ? (
                    <RecordCodRefundTrigger returnId={r.id} refundUpiId={r.refundUpiId} />
                  ) : null}

                  {r.type === "exchange" && r.status === "refunded" ? (
                    <ShipExchangeTrigger returnId={r.id} />
                  ) : null}

                  {r.outboundAwb && r.outboundAwb !== "PENDING" ? (
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-cocoa/12 bg-cocoa/4 px-4 py-3">
                      <div>
                        <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-charcoal/55">
                          Replacement {r.status === "exchange_delivered" ? "delivered" : "shipped"}
                        </p>
                        <p className="mt-1 font-mono text-xs tabular-nums text-charcoal/70">
                          AWB {r.outboundAwb}
                        </p>
                      </div>
                      <Link
                        href={`https://www.delhivery.com/track-v2/package/${encodeURIComponent(r.outboundAwb)}`}
                        target="_blank"
                        rel="noopener"
                        className="soft-link text-[11px] font-bold uppercase tracking-[0.18em] text-cocoa"
                      >
                        Track shipment
                      </Link>
                    </div>
                  ) : null}

                  {/* Meta footer */}
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-cocoa/8 pt-3 text-xs text-charcoal/55">
                    <p>Raised {fmtDateTime(r.createdAt)}</p>
                    {r.resolvedAt ? (
                      <p>
                        Resolved {fmtDateTime(r.resolvedAt)}
                        {r.codRefundReference ? ` · ref ${r.codRefundReference}` : ""}
                      </p>
                    ) : null}
                  </div>
                </AdminCard>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Pagination
        page={result.page}
        totalPages={totalPages}
        basePath="/studio/returns"
        params={{ status, type: typeFilter !== "all" ? typeFilter : undefined }}
      />
    </div>
  );
}
