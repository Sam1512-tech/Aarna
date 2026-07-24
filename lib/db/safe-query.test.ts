import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { safeDbRead } from "./safe-query";

describe("safeDbRead", () => {
  beforeEach(() => {
    // Keep the intentional fallback-path console.error out of the test output.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("passes a value straight through when it resolves before the timeout", async () => {
    const result = await safeDbRead(Promise.resolve(42), {
      timeoutMs: 1000,
      fallback: -1,
      label: "fast",
    });
    expect(result).toBe(42);
  });

  it("returns the fallback when the query rejects", async () => {
    const result = await safeDbRead(Promise.reject(new Error("boom")), {
      timeoutMs: 1000,
      fallback: "fallback",
      label: "rejecting",
    });
    expect(result).toBe("fallback");
  });

  it("returns the fallback and fires onTimeout when the query hangs past the timeout", async () => {
    const onTimeout = vi.fn();
    // Never settles — this is the exact pooler-hang case that used to fail the
    // build. Must resolve to the fallback within ~timeoutMs regardless.
    const hangs = new Promise<number>(() => {});
    const start = Date.now();
    const result = await safeDbRead(hangs, {
      timeoutMs: 30,
      fallback: -1,
      label: "hanging",
      onTimeout,
    });
    expect(result).toBe(-1);
    expect(onTimeout).toHaveBeenCalledOnce();
    // Bounded by the timeout, not left waiting on the hung promise.
    expect(Date.now() - start).toBeLessThan(500);
  });

  it("still returns the fallback if onTimeout itself throws", async () => {
    const result = await safeDbRead(new Promise<number>(() => {}), {
      timeoutMs: 20,
      fallback: 7,
      label: "cancel-throws",
      onTimeout: () => {
        throw new Error("cancel connection failed");
      },
    });
    expect(result).toBe(7);
  });

  it("does not surface an unhandled rejection when the query rejects AFTER the timeout won", async () => {
    const rejectsLate = new Promise<number>((_, reject) =>
      setTimeout(() => reject(new Error("late")), 40),
    );
    const result = await safeDbRead(rejectsLate, {
      timeoutMs: 15,
      fallback: -1,
      label: "late-reject",
    });
    expect(result).toBe(-1);
    // Let the late rejection fire; if it were unhandled, vitest fails the run.
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
});
