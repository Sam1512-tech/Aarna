// India Post's free, public pincode lookup — no auth required. Extracted
// from components/storefront/checkout-view.tsx (which originally defined
// this inline) so lib/actions/checkout.ts can reuse the exact same lookup
// server-side, rather than maintaining two independent copies that could
// drift apart — the class of bug this project has hit before with
// duplicated lists/logic (see CLAUDE.md's Fix Protocol).
//
// Known to be flaky (timeouts/5xx/429, or blocked by an ad-blocker/network
// filter). Callers should only hard-block on "not_found" (the API
// positively confirms the pincode doesn't exist) — "unknown" (timeout,
// non-2xx, bad JSON, network error) should fall through optimistically
// rather than penalizing the customer for a third-party API hiccup.
export interface PostalRecord {
  district: string;
  state: string;
}
export type PostalLookup =
  | { status: "found"; record: PostalRecord }
  | { status: "not_found" }
  | { status: "unknown" };

export async function fetchIndiaPostal(pincode: string): Promise<PostalLookup> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(
      `https://api.postalpincode.in/pincode/${pincode}`,
      { signal: controller.signal },
    );
    clearTimeout(timeoutId);
    if (!res.ok) return { status: "unknown" };
    const data = await res.json();
    const record = Array.isArray(data) ? data[0] : null;
    if (!record) return { status: "unknown" };
    if (record.Status !== "Success") return { status: "not_found" };
    const po = record.PostOffice?.[0];
    if (!po?.District || !po?.State) return { status: "not_found" };
    return {
      status: "found",
      record: { district: String(po.District), state: String(po.State) },
    };
  } catch {
    return { status: "unknown" };
  }
}
