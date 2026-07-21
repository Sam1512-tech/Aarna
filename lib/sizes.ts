/**
 * Canonical garment size order — shared everywhere sizes are displayed or
 * sorted, so an alphabetical DB sort never puts "L" before "S" again
 * (`ORDER BY size ASC` gives L, M, S, XL, XS — alphabetical, not garment
 * order). Matches the admin's size-tag presets
 * (app/admin/products/[id]/product-edit-view.tsx).
 *
 * Aarna's catalog stops at XL — there is no XXL. Sizes outside this list
 * (any custom text an admin types) still sort after the presets, in
 * whatever order they were encountered.
 */
export const GARMENT_SIZE_ORDER = ["XS", "S", "M", "L", "XL"];

function sizeSortRank(size: string): number {
  const idx = GARMENT_SIZE_ORDER.indexOf(size.trim().toUpperCase());
  return idx === -1 ? GARMENT_SIZE_ORDER.length : idx;
}

/** Stable-sorts anything with a `.size` field into canonical garment order. */
export function sortBySize<T extends { size: string | null }>(items: T[]): T[] {
  return [...items]
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const rank = sizeSortRank(a.item.size ?? "") - sizeSortRank(b.item.size ?? "");
      return rank !== 0 ? rank : a.index - b.index;
    })
    .map(({ item }) => item);
}
