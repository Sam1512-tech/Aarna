import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchIndiaPostal } from "./india-postal";

function mockFetchOnce(response: unknown, ok = true) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok,
      json: async () => response,
    }),
  );
}

describe("fetchIndiaPostal", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the real district/state for a found pincode", () => {
    // Real shape of api.postalpincode.in's response for 396445 (Navsari,
    // Gujarat) — the exact pincode that surfaced this whole check: two real
    // orders had "Karnataka" as their stored state despite shipping here.
    mockFetchOnce([
      {
        Status: "Success",
        PostOffice: [{ District: "Navsari", State: "Gujarat" }],
      },
    ]);
    return fetchIndiaPostal("396445").then((result) => {
      expect(result).toEqual({
        status: "found",
        record: { district: "Navsari", state: "Gujarat" },
      });
    });
  });

  it("returns not_found when the API positively confirms the pincode doesn't exist", async () => {
    mockFetchOnce([{ Status: "Error", PostOffice: null }]);
    expect(await fetchIndiaPostal("000000")).toEqual({ status: "not_found" });
  });

  it("returns unknown on a non-2xx response rather than treating it as invalid", async () => {
    mockFetchOnce({}, false);
    expect(await fetchIndiaPostal("560001")).toEqual({ status: "unknown" });
  });

  it("returns unknown on a network failure rather than throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network error")),
    );
    expect(await fetchIndiaPostal("560001")).toEqual({ status: "unknown" });
  });

  it("returns unknown on a malformed/empty response body", async () => {
    mockFetchOnce([]);
    expect(await fetchIndiaPostal("560001")).toEqual({ status: "unknown" });
  });
});
