import { describe, expect, it } from "vitest";
import { MAX_REORDER_IDS, moveItem, planImageOrder } from "./image-order";

describe("moveItem", () => {
  const abc = ["a", "b", "c", "d"];

  it("moves an item left and right", () => {
    expect(moveItem(abc, 2, 1)).toEqual(["a", "c", "b", "d"]);
    expect(moveItem(abc, 1, 2)).toEqual(["a", "c", "b", "d"]);
  });

  it("moves to the very start and the very end", () => {
    expect(moveItem(abc, 3, 0)).toEqual(["d", "a", "b", "c"]);
    expect(moveItem(abc, 0, 3)).toEqual(["b", "c", "d", "a"]);
  });

  it("does not mutate its input", () => {
    const input = [...abc];
    moveItem(input, 0, 2);
    expect(input).toEqual(abc);
  });

  it("returns the same reference for a no-op or out-of-range move", () => {
    expect(moveItem(abc, 1, 1)).toBe(abc);
    expect(moveItem(abc, -1, 2)).toBe(abc);
    expect(moveItem(abc, 0, 4)).toBe(abc);
    expect(moveItem(abc, 4, 0)).toBe(abc);
    expect(moveItem(abc, 0.5, 1)).toBe(abc);
    expect(moveItem([], 0, 0)).toEqual([]);
  });
});

describe("planImageOrder", () => {
  const current = ["i1", "i2", "i3", "i4"];

  it("accepts a full reordering and returns it unchanged", () => {
    expect(planImageOrder(current, ["i3", "i1", "i4", "i2"])).toEqual(["i3", "i1", "i4", "i2"]);
  });

  it("accepts the existing order (a harmless no-op)", () => {
    expect(planImageOrder(current, current)).toEqual(current);
  });

  it("keeps an image added elsewhere after this page loaded, after the requested ones", () => {
    // the admin's screen only knew i1..i3; i4 and i5 exist now
    expect(planImageOrder(["i1", "i2", "i3", "i4", "i5"], ["i3", "i1", "i2"])).toEqual([
      "i3",
      "i1",
      "i2",
      "i4",
      "i5",
    ]);
  });

  it("keeps leftovers in their current relative order", () => {
    expect(planImageOrder(["a", "x", "b", "y", "c"], ["c", "a", "b"])).toEqual([
      "c",
      "a",
      "b",
      "x",
      "y",
    ]);
  });

  it("rejects an id that no longer exists (deleted from another window)", () => {
    expect(() => planImageOrder(current, ["i1", "gone", "i2"])).toThrow(/refresh the page/);
  });

  it("rejects an id belonging to another product", () => {
    expect(() => planImageOrder(current, ["i1", "someone-elses-image"])).toThrow(/refresh the page/);
  });

  it("rejects duplicates, which would otherwise number one image twice", () => {
    expect(() => planImageOrder(current, ["i1", "i1", "i2"])).toThrow(/appears twice/);
  });

  it("rejects an empty or oversized request", () => {
    expect(() => planImageOrder(current, [])).toThrow(/invalid/);
    const many = Array.from({ length: MAX_REORDER_IDS + 1 }, (_, i) => `x${i}`);
    expect(() => planImageOrder(many, many)).toThrow(/invalid/);
  });

  it("rejects non-string ids and non-arrays", () => {
    expect(() => planImageOrder(current, [1 as unknown as string])).toThrow(/invalid/);
    expect(() => planImageOrder(current, "i1" as unknown as string[])).toThrow(/invalid/);
  });

  it("rejects any request for a product that has no images", () => {
    expect(() => planImageOrder([], ["i1"])).toThrow(/refresh the page/);
  });
});
