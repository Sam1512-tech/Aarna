import type { Metadata } from "next";
import { Star } from "lucide-react";
import {
  AdminEmpty,
  AdminPageHeader,
  tableClasses,
} from "@/components/admin/admin-primitives";
import { AutoSubmitForm } from "@/components/admin/auto-submit-form";
import { DeleteButton } from "@/components/admin/delete-button";
import { ReviewStatusSelect } from "@/components/admin/review-status-select";
import { deleteReview, getAdminReviews } from "@/lib/actions/admin/reviews";

export const metadata: Metadata = { title: "Admin · reviews" };

const STATUSES = ["pending", "approved", "rejected"] as const;
type ReviewStatus = (typeof STATUSES)[number];

// Vercel functions default to UTC even in bom1 — pin every admin date to IST
// so timestamps match the client's phone clock.
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

export default async function AdminReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const status = (STATUSES as readonly string[]).includes(params.status ?? "")
    ? (params.status as ReviewStatus)
    : undefined;

  const result = await getAdminReviews({ status, page, pageSize: 30 }).catch(
    () => ({ items: [], total: 0, page: 1, pageSize: 30 }),
  );

  const t = tableClasses();
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));

  return (
    <div>
      <AdminPageHeader
        eyebrow="Community"
        title="Reviews"
        intro="Customer reviews awaiting moderation or already published."
      />

      <AutoSubmitForm className="mt-6 flex flex-wrap items-end gap-3">
        <label>
          <span className="block text-[11px] font-medium uppercase tracking-[0.16em] text-charcoal/55">
            status
          </span>
          <select
            name="status"
            defaultValue={status ?? ""}
            className="mt-1.5 block rounded-xl border border-cocoa/20 bg-cream px-4 py-2.5 text-base text-charcoal outline-none transition duration-500 focus:border-cocoa sm:text-sm"
          >
            <option value="">all</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </AutoSubmitForm>

      <div className="mt-6">
        {result.items.length === 0 ? (
          <AdminEmpty
            title="No reviews match"
            description="The moderation queue is empty for this filter."
          />
        ) : (
          <div className={t.wrapper}>
            <table className={t.table}>
              <thead className={t.thead}>
                <tr>
                  <th className={t.th}>product</th>
                  <th className={t.th}>rating</th>
                  <th className={t.th}>review</th>
                  <th className={t.th}>submitted</th>
                  <th className={t.th}>status</th>
                  <th className={t.th}></th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((r) => (
                  <tr key={r.id} className={t.tr}>
                    <td className={t.td}>{r.productTitle}</td>
                    <td className={t.td}>
                      <span className="inline-flex items-center gap-1 text-cocoa">
                        <Star className="h-3 w-3 fill-current" aria-hidden="true" />
                        <span className="tabular-nums">{r.rating}</span>
                      </span>
                    </td>
                    <td className={`${t.td} max-w-md truncate`}>
                      {r.body ? (
                        <p className="truncate text-charcoal/85" title={r.body}>
                          {r.body}
                        </p>
                      ) : (
                        <span className="text-charcoal/40">—</span>
                      )}
                      {r.customerName ? (
                        <p className="mt-0.5 truncate text-xs text-charcoal/55">
                          {r.customerName}
                        </p>
                      ) : null}
                    </td>
                    <td className={t.td}>{fmtDate(r.createdAt)}</td>
                    <td className={t.td}>
                      <ReviewStatusSelect reviewId={r.id} status={r.status} />
                    </td>
                    <td className={t.td}>
                      <div className="flex justify-end">
                        <DeleteButton
                          action={deleteReview}
                          id={r.id}
                          label={`delete review by ${r.customerName ?? "customer"}`}
                          confirmMessage="Delete this review? This cannot be undone."
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {totalPages > 1 ? (
        <p className="mt-6 text-center text-xs text-charcoal/50">
          page {result.page} of {totalPages} · {result.total} total
        </p>
      ) : null}
    </div>
  );
}
