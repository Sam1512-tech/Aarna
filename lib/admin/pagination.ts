/**
 * Builds a page link for an admin list page — preserves every other active
 * filter (whatever the caller passes in `params`) while pointing `page` at
 * `targetPage`. A falsy filter value is omitted, matching how each admin
 * page already treats an empty filter as "no filter". `targetPage === 1`
 * omits `page` from the URL entirely so the first page's link matches the
 * page's own bare path.
 */
export function buildPaginationHref(
  basePath: string,
  targetPage: number,
  params: Record<string, string | undefined>,
): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) qs.set(key, value);
  }
  if (targetPage > 1) qs.set("page", String(targetPage));
  const s = qs.toString();
  return s ? `${basePath}?${s}` : basePath;
}
