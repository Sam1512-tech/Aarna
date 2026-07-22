import type { Metadata } from "next";
import Link from "next/link";
import {
  AdminEmpty,
  AdminPageHeader,
} from "@/components/admin/admin-primitives";
import { ReturnStatusSelect } from "@/components/admin/return-status-select";
import { ReturnPhotoGrid } from "@/components/admin/return-photo-grid";
import { ReturnQcTrigger } from "@/components/admin/return-qc-trigger";
import { REJECT_REASONS } from "@/lib/returns/reject-reasons";
import { getAdminReturns } from "@/lib/actions/admin/returns";
import { formatINR } from "@/lib/utils";

export const metadata: Metadata = { title: "admin · returns" };

const STATUSES = [
  "requested",
  "approved",
  "rejected",
  "picked",
  "received",
  "refunded",
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
  size_fit: "size or fit",
  quality: "quality issue",
  damaged: "arrived damaged",
  wrong_item: "wrong item sent",
  changed_mind: "changed mind",
  color: "different colour",
  style: "different style",
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
        eyebrow="commerce"
        title="returns & exchanges"
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

      {/* Type tabs */}
      <div
        role="tablist"
        aria-label="Type filter"
        className="mt-6 flex gap-1 overflow-x-auto border-b border-cocoa/12"
      >
        <TypeTab
          label="all"
          count={counts.all}
          type="all"
          active={typeFilter === "all"}
          status={status}
        />
        <TypeTab
          label="returns"
          count={counts.returns}
          type="return"
          active={typeFilter === "return"}
          status={status}
        />
        <TypeTab
          label="exchanges"
          count={counts.exchanges}
          type="exchange"
          active={typeFilter === "exchange"}
          status={status}
        />
      </div>

      {/* Status filter */}
      <form
        method="get"
        className="mt-5 flex flex-wrap items-end gap-3"
      >
        {typeFilter !== "all" ? (
          <input type="hidden" name="type" value={typeFilter} />
        ) : null}
        <label>
          <span className="block text-[11px] font-medium uppercase tracking-[0.16em] text-charcoal/55">
            status
          </span>
          <select
            name="status"
            defaultValue={status ?? ""}
            className="mt-1.5 block rounded-xl border border-cocoa/20 bg-cream px-4 py-2.5 text-base text-charcoal outline-none transition duration-500 focus:border-cocoa sm:text-sm"
          >
            <option value="">all statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="rounded-full bg-cocoa px-4 py-2 text-[11px] font-medium uppercase tracking-[0.16em] text-cream transition duration-500 hover:bg-cocoa/90"
        >
          filter
        </button>
        {status ? (
          <Link
            href={
              typeFilter === "all"
                ? "/studio/returns"
                : `/studio/returns?type=${typeFilter}`
            }
            className="text-[11px] font-medium uppercase tracking-[0.16em] text-charcoal/55 transition hover:text-cocoa"
          >
            clear
          </Link>
        ) : null}
      </form>

      <div className="mt-6">
        {filtered.length === 0 ? (
          <AdminEmpty
            title="no requests match"
            description="the queue is clear for this filter."
          />
        ) : (
          <ul className="space-y-4">
            {filtered.map((r) => {
              const isStale =
                r.status === "requested" &&
                hoursSince(r.createdAt) > STALE_THRESHOLD_HOURS;
              return (
                <li
                  key={r.id}
                  className="rounded-2xl border border-cocoa/12 bg-cream p-5 shadow-[0_10px_28px_rgba(43,38,35,0.04)] md:p-6"
                >
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
                        <Link
                          href={`/studio/orders/${r.orderId}`}
                          className="soft-link text-[11px] font-medium uppercase tracking-[0.16em] text-charcoal/60"
                        >
                          order · {r.orderNumber}
                        </Link>
                        {isStale ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-burnt-red/25 bg-burnt-red/6 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-burnt-red">
                            <span className="h-1.5 w-1.5 rounded-full bg-burnt-red" />
                            {Math.round(hoursSince(r.createdAt))}h waiting
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-2 font-display text-xl lowercase leading-tight text-maroon">
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
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <ReturnStatusSelect
                        returnId={r.id}
                        status={r.status as ReturnStatus}
                      />
                      {r.refundAmount ? (
                        <p className="text-right text-sm">
                          <span className="text-charcoal/55">refund </span>
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
                        customer note
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
                        rejected · {REJECT_REASON_LABEL[r.rejectionReason] ?? r.rejectionReason}
                      </p>
                      {r.adminNote ? (
                        <p className="mt-1.5 whitespace-pre-wrap text-sm leading-6 text-charcoal/70">
                          {r.adminNote}
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {r.status === "received" ? (
                    <ReturnQcTrigger
                      returnId={r.id}
                      refundAmount={r.refundAmount ?? r.lineTotal}
                      type={r.type as "return" | "exchange"}
                    />
                  ) : null}

                  {/* Meta footer */}
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-cocoa/8 pt-3 text-xs text-charcoal/55">
                    <p>raised {fmtDateTime(r.createdAt)}</p>
                    {r.resolvedAt ? (
                      <p>resolved {fmtDateTime(r.resolvedAt)}</p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {result.total > result.pageSize ? (
        <p className="mt-6 text-center text-xs text-charcoal/50">
          page {result.page} · {result.total} total across all types
        </p>
      ) : null}
    </div>
  );
}

function TypeTab({
  label,
  count,
  type,
  active,
  status,
}: {
  label: string;
  count: number;
  type: TypeFilter;
  active: boolean;
  status: ReturnStatus | undefined;
}) {
  const params = new URLSearchParams();
  if (type !== "all") params.set("type", type);
  if (status) params.set("status", status);
  const qs = params.toString();
  const href = qs ? `/studio/returns?${qs}` : "/studio/returns";

  return (
    <Link
      href={href}
      role="tab"
      aria-selected={active}
      scroll={false}
      className={`relative -mb-px flex shrink-0 items-center gap-2 px-4 py-3 text-[11px] font-medium uppercase tracking-[0.18em] transition duration-300 ${
        active
          ? "text-maroon"
          : "text-charcoal/50 hover:text-charcoal/80"
      }`}
    >
      {label}
      <span
        className={`rounded-full px-1.5 py-0.5 text-[9px] tabular-nums ${
          active ? "bg-maroon/12 text-maroon" : "bg-cocoa/8 text-charcoal/55"
        }`}
      >
        {count}
      </span>
      {active ? (
        <span
          aria-hidden="true"
          className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-maroon"
        />
      ) : null}
    </Link>
  );
}
