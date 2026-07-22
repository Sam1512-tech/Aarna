import Link from "next/link";
import type { Metadata } from "next";
import {
  AdminEmpty,
  AdminPageHeader,
  StatusPill,
  tableClasses,
} from "@/components/admin/admin-primitives";
import { DeleteButton } from "@/components/admin/delete-button";
import { deleteProduct, getAdminProducts } from "@/lib/actions/admin/products";
import { formatINR } from "@/lib/utils";

export const metadata: Metadata = { title: "Admin · products" };

type Status = "draft" | "active" | "archived";
const STATUSES: Status[] = ["draft", "active", "archived"];

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    search?: string;
    page?: string;
  }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const status = (STATUSES as string[]).includes(params.status ?? "")
    ? (params.status as Status)
    : undefined;
  const search = params.search?.trim() || undefined;

  const result = await getAdminProducts({ status, search, page, pageSize: 20 }).catch(() => ({
    items: [],
    total: 0,
    page: 1,
    pageSize: 20,
  }));

  const t = tableClasses();
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));

  return (
    <div>
      <AdminPageHeader
        eyebrow="Catalog"
        title="Products"
        intro="Every piece the storefront can show. Publish, archive, or edit inline."
        action={{ href: "/studio/products/new", label: "add product" }}
      />

      <form
        method="get"
        className="mt-6 flex flex-wrap items-end gap-3"
      >
        <label className="min-w-56 flex-1">
          <span className="block text-[11px] font-medium uppercase tracking-[0.16em] text-charcoal/55">
            search
          </span>
          <input
            name="search"
            defaultValue={search ?? ""}
            placeholder="title, slug or sku…"
            className="mt-1.5 block w-full rounded-xl border border-cocoa/20 bg-cream px-4 py-2.5 text-sm text-charcoal outline-none transition duration-500 focus:border-cocoa"
          />
        </label>
        <label>
          <span className="block text-[11px] font-medium uppercase tracking-[0.16em] text-charcoal/55">
            status
          </span>
          <select
            name="status"
            defaultValue={status ?? ""}
            className="mt-1.5 block rounded-xl border border-cocoa/20 bg-cream px-4 py-2.5 text-sm text-charcoal outline-none transition duration-500 focus:border-cocoa"
          >
            <option value="">all</option>
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
      </form>

      <div className="mt-6">
        {result.items.length === 0 ? (
          <AdminEmpty
            title="No products yet"
            description="Pieces you add will appear here. drafts start hidden from the storefront until you set them to active."
            cta={{ href: "/studio/products/new", label: "add your first product" }}
          />
        ) : (
          <>
            <div className={t.wrapper}>
              <table className={t.table}>
                <thead className={t.thead}>
                  <tr>
                    <th className={t.th}>title</th>
                    <th className={t.th}>price</th>
                    <th className={t.th}>mrp</th>
                    <th className={t.th}>status</th>
                    <th className={t.th}></th>
                  </tr>
                </thead>
                <tbody>
                  {result.items.map((p) => (
                    <tr key={p.id} className={t.tr}>
                      <td className={t.td}>
                        <p className="text-charcoal">{p.title}</p>
                        <p className="text-xs text-charcoal/50">/{p.slug}</p>
                      </td>
                      <td className={t.td}>{formatINR(p.basePrice)}</td>
                      <td className={t.td}>
                        {p.mrp ? formatINR(p.mrp) : "—"}
                      </td>
                      <td className={t.td}>
                        <StatusPill
                          label={p.status}
                          tone={
                            p.status === "active"
                              ? "ok"
                              : p.status === "archived"
                                ? "bad"
                                : "muted"
                          }
                        />
                      </td>
                      <td className={t.td}>
                        <div className="flex items-center justify-end gap-3">
                          <Link
                            href={`/studio/products/${p.id}`}
                            className="soft-link text-[11px] font-bold uppercase tracking-[0.16em] text-cocoa"
                          >
                            edit
                          </Link>
                          <DeleteButton
                            action={deleteProduct}
                            id={p.id}
                            label={`delete ${p.title}`}
                            confirmMessage={`Delete "${p.title}"? This removes all its variants and images too — this cannot be undone.`}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 ? (
              <Pagination page={result.page} totalPages={totalPages} status={status} search={search} />
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  status,
  search,
}: {
  page: number;
  totalPages: number;
  status?: string;
  search?: string;
}) {
  const build = (p: number) => {
    const qs = new URLSearchParams();
    if (status) qs.set("status", status);
    if (search) qs.set("search", search);
    if (p > 1) qs.set("page", String(p));
    const s = qs.toString();
    return s ? `/studio/products?${s}` : "/studio/products";
  };
  return (
    <nav className="mt-6 flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.16em] text-charcoal/60">
      {page > 1 ? (
        <Link href={build(page - 1)} className="soft-link text-cocoa">
          ← previous
        </Link>
      ) : (
        <span className="opacity-40">← previous</span>
      )}
      <span>
        page {page} of {totalPages}
      </span>
      {page < totalPages ? (
        <Link href={build(page + 1)} className="soft-link text-cocoa">
          next →
        </Link>
      ) : (
        <span className="opacity-40">next →</span>
      )}
    </nav>
  );
}
