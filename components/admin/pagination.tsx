import Link from "next/link";
import { buildPaginationHref } from "@/lib/admin/pagination";

export interface PaginationProps {
  page: number;
  totalPages: number;
  /** The page's own path, e.g. "/studio/orders". */
  basePath: string;
  /**
   * Every other active filter to preserve across page links — whatever this
   * page's own searchParams currently are, minus `page` itself (that's set
   * per-link below). A falsy value is omitted from the URL, matching how
   * each page already treats an empty filter as "no filter".
   */
  params?: Record<string, string | undefined>;
}

/**
 * Real prev/next navigation for an admin list page, replacing what used to
 * be a plain "page X of Y" string with no way to actually reach page 2.
 * Extracted from app/studio/products/page.tsx (the one admin list that had
 * this right) so every paginated admin page shares one implementation.
 */
export function Pagination({ page, totalPages, basePath, params = {} }: PaginationProps) {
  if (totalPages <= 1) return null;

  const build = (p: number) => buildPaginationHref(basePath, p, params);

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
