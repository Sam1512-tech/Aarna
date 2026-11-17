import { describe, expect, it } from "vitest";
import {
  UPLOAD_MAX_BYTES,
  fitWithin,
  needsShrinking,
  shrunkName,
} from "./prepare-upload";

const MB = 1024 * 1024;

describe("UPLOAD_MAX_BYTES", () => {
  it("stays under Vercel's 4.5 MB request-body cap, with room for multipart overhead", () => {
    expect(UPLOAD_MAX_BYTES).toBeLessThan(4.5 * MB);
    expect(UPLOAD_MAX_BYTES).toBeLessThanOrEqual(4 * MB);
  });
});

describe("needsShrinking", () => {
  it("leaves photos that already upload fine alone", () => {
    expect(needsShrinking(1 * MB)).toBe(false);
    expect(needsShrinking(3.5 * MB)).toBe(false);
  });

  it("shrinks anything above 3.5 MB — including the 4.5–8 MB range that used to fail", () => {
    expect(needsShrinking(3.6 * MB)).toBe(true);
    expect(needsShrinking(5 * MB)).toBe(true);
    expect(needsShrinking(8 * MB)).toBe(true);
    expect(needsShrinking(25 * MB)).toBe(true);
  });
});

describe("fitWithin", () => {
  it("scales a big portrait photo so its longest side is the max, keeping the shape", () => {
    expect(fitWithin(3024, 4032, 2400)).toEqual({ width: 1800, height: 2400 });
  });

  it("scales a big landscape photo the same way", () => {
    expect(fitWithin(6000, 4000, 2400)).toEqual({ width: 2400, height: 1600 });
  });

  it("never scales up", () => {
    expect(fitWithin(1500, 2000, 2400)).toEqual({ width: 1500, height: 2000 });
    expect(fitWithin(2400, 1000, 2400)).toEqual({ width: 2400, height: 1000 });
  });

  it("never returns a zero-sized side", () => {
    expect(fitWithin(10000, 1, 2400).height).toBeGreaterThanOrEqual(1);
  });
});

describe("shrunkName", () => {
  it("swaps the extension for .jpg", () => {
    expect(shrunkName("IMG_0042.HEIC")).toBe("IMG_0042.jpg");
    expect(shrunkName("banner.final.png")).toBe("banner.final.jpg");
  });

  it("adds .jpg when there is no extension, and survives an empty name", () => {
    expect(shrunkName("photo")).toBe("photo.jpg");
    expect(shrunkName("")).toBe("photo.jpg");
  });
});
