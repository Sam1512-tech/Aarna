import { describe, expect, it } from "vitest";
import { isForeignKeyViolation } from "./errors";

describe("isForeignKeyViolation", () => {
  it("matches a raw postgres.PostgresError shape (err.code)", () => {
    expect(isForeignKeyViolation({ code: "23503" })).toBe(true);
  });

  it("matches a Drizzle-wrapped DrizzleQueryError shape (err.cause.code)", () => {
    // This is the real shape confirmed live: drizzle-orm's postgres-js
    // driver wraps the underlying PostgresError in a DrizzleQueryError with
    // the original error on `.cause`, so `err.code` itself is undefined.
    expect(
      isForeignKeyViolation({
        message: 'Failed query: delete from "categories" ...',
        cause: { code: "23503", message: "violates foreign key constraint" },
      }),
    ).toBe(true);
  });

  it("does not match an unrelated Postgres error code", () => {
    expect(isForeignKeyViolation({ code: "23505" })).toBe(false); // unique_violation
    expect(isForeignKeyViolation({ cause: { code: "23505" } })).toBe(false);
  });

  it("does not match a plain Error with no code", () => {
    expect(isForeignKeyViolation(new Error("something else went wrong"))).toBe(false);
  });

  it("does not match an ActionError", () => {
    expect(isForeignKeyViolation({ name: "ActionError", message: "Cannot delete" })).toBe(false);
  });

  it("handles null/undefined/primitive inputs without throwing", () => {
    expect(isForeignKeyViolation(null)).toBe(false);
    expect(isForeignKeyViolation(undefined)).toBe(false);
    expect(isForeignKeyViolation("just a string")).toBe(false);
    expect(isForeignKeyViolation(42)).toBe(false);
  });
});
