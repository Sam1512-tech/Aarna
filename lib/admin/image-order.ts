/**
 * Pure helpers for reordering a product's pictures (the admin "move left /
 * move right" controls and the server action behind them).
 *
 * A product's gallery order is `product_images.sort_order` — every storefront
 * surface (cards, product page, cart, orders…) already sorts by it, so
 * reordering is only ever a matter of rewriting those numbers. The first image
 * is the one shown in listings and first on the product page.
 *
 * Plain module (no "use server"/"use client"): the admin editor and the server
 * action both import it.
 */
import { ActionError } from "@/lib/action-error";

/** Upper bound on one request — far above any real gallery, just a sanity cap. */
export const MAX_REORDER_IDS = 100;

/**
 * Returns a copy of `list` with the item at `from` moved to index `to`.
 * Out-of-range or no-op moves return the list unchanged (same reference), so a
 * caller can detect "nothing to do" with `===`.
 */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 0 ||
    to < 0 ||
    from >= list.length ||
    to >= list.length ||
    from === to
  ) {
    return list;
  }
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/**
 * Decides the final order of a product's images from the order an admin asked
 * for. `currentIds` are the ids that really exist for the product right now;
 * `requestedIds` is what the admin's screen showed.
 *
 *  - Every requested id must exist for this product and appear only once —
 *    otherwise the screen is out of date (an image was deleted elsewhere), and
 *    guessing would silently scramble the gallery, so it's rejected.
 *  - An image that exists but wasn't in the request (added from another
 *    window after this one loaded) is kept and placed after the requested ones,
 *    in its current relative order — never dropped.
 *
 * Returns every id, in the order they should be numbered 0, 1, 2…
 */
export function planImageOrder(currentIds: string[], requestedIds: string[]): string[] {
  if (!Array.isArray(requestedIds) || requestedIds.some((id) => typeof id !== "string")) {
    throw new ActionError("Image order is invalid.");
  }
  if (requestedIds.length === 0 || requestedIds.length > MAX_REORDER_IDS) {
    throw new ActionError("Image order is invalid.");
  }
  if (new Set(requestedIds).size !== requestedIds.length) {
    throw new ActionError("Image order is invalid — an image appears twice.");
  }

  const existing = new Set(currentIds);
  if (requestedIds.some((id) => !existing.has(id))) {
    throw new ActionError(
      "The images changed since this page loaded — refresh the page and try again.",
    );
  }

  const requested = new Set(requestedIds);
  const leftovers = currentIds.filter((id) => !requested.has(id));
  return [...requestedIds, ...leftovers];
}
