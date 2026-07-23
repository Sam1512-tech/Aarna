import { describe, expect, it } from "vitest";
import { isUniqueViolation } from "./pg-error";

describe("isUniqueViolation", () => {
  it("returns true for a 23505 error matching the given constraint", () => {
    expect(
      isUniqueViolation(
        { code: "23505", constraint_name: "products_style_code_unique" },
        "products_style_code_unique",
      ),
    ).toBe(true);
  });

  it("returns false when the constraint name differs", () => {
    expect(
      isUniqueViolation(
        { code: "23505", constraint_name: "products_slug_unique" },
        "products_style_code_unique",
      ),
    ).toBe(false);
  });

  it("returns true when no constraint name is specified and the code matches", () => {
    expect(isUniqueViolation({ code: "23505", constraint_name: "anything" })).toBe(true);
  });

  it("returns false for a non-unique-violation error code", () => {
    expect(isUniqueViolation({ code: "23503" }, "products_style_code_unique")).toBe(false);
  });

  it("returns false when code is missing entirely", () => {
    expect(isUniqueViolation({ constraint_name: "products_style_code_unique" })).toBe(false);
  });

  it("returns false for non-object, null, or undefined input", () => {
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
    expect(isUniqueViolation("boom")).toBe(false);
    expect(isUniqueViolation(42)).toBe(false);
    expect(isUniqueViolation(new Error("plain"))).toBe(false);
  });

  it("unwraps a Drizzle-style wrapper error via .cause (the real shape thrown in prod)", () => {
    // drizzle-orm's postgres-js driver wraps every query error in a
    // DrizzleQueryError with the underlying PostgresError attached as
    // `.cause` — `err.code` is undefined on the wrapper itself. Confirmed
    // live against the real dev DB while building this fix.
    const wrapped = Object.assign(new Error("Failed query: insert into ..."), {
      cause: { code: "23505", constraint_name: "products_style_code_unique" },
    });
    expect(isUniqueViolation(wrapped, "products_style_code_unique")).toBe(true);
    expect(isUniqueViolation(wrapped, "product_variants_sku_unique")).toBe(false);
  });

  it("does not unwrap .cause when the outer error already matches on its own code", () => {
    const err = { code: "23505", constraint_name: "products_style_code_unique", cause: { code: "99999" } };
    expect(isUniqueViolation(err, "products_style_code_unique")).toBe(true);
  });

  it("returns false when neither the error nor its .cause is a unique violation", () => {
    const wrapped = Object.assign(new Error("Failed query: ..."), {
      cause: { code: "23503", constraint_name: "product_variants_product_id_products_id_fk" },
    });
    expect(isUniqueViolation(wrapped, "products_style_code_unique")).toBe(false);
  });
});
