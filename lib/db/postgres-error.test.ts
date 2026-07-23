import { describe, expect, it } from "vitest";
import { postgresErrorCode } from "./postgres-error";

describe("postgresErrorCode", () => {
  it("extracts the code from err.cause — the actual shape Drizzle throws", () => {
    // Confirmed live against the real dev DB: Drizzle wraps the real
    // postgres-js PostgresError (which carries .code) inside its own
    // DrizzleQueryError, nested at .cause — not directly on the error.
    const err = { message: "Failed query", cause: { code: "23505", message: "duplicate key" } };
    expect(postgresErrorCode(err)).toBe("23505");
  });

  it("also checks the top level, defensively, in case some call path doesn't wrap", () => {
    const err = { code: "23503" };
    expect(postgresErrorCode(err)).toBe("23503");
  });

  it("prefers the top-level code over .cause when both are present", () => {
    const err = { code: "23505", cause: { code: "23503" } };
    expect(postgresErrorCode(err)).toBe("23505");
  });

  it("returns undefined for a plain Error with no Postgres code anywhere", () => {
    expect(postgresErrorCode(new Error("something else went wrong"))).toBeUndefined();
  });

  it("returns undefined for non-object values", () => {
    expect(postgresErrorCode(null)).toBeUndefined();
    expect(postgresErrorCode(undefined)).toBeUndefined();
    expect(postgresErrorCode("a string error")).toBeUndefined();
  });

  it("returns undefined when .cause exists but has no code", () => {
    const err = { cause: { message: "some other cause" } };
    expect(postgresErrorCode(err)).toBeUndefined();
  });
});
