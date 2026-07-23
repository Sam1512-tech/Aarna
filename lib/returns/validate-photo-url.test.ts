import { describe, expect, it } from "vitest";
import { ActionError } from "@/lib/action-error";
import { validateReturnPhotoUrl } from "./validate-photo-url";

const CLOUD_NAME = "dnlzgwzeo";
const VALID_URL = `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/v1700000000/aarna/returns/abc123.jpg`;

describe("validateReturnPhotoUrl", () => {
  it("accepts a real Cloudinary delivery URL for the configured cloud", () => {
    expect(validateReturnPhotoUrl(VALID_URL, CLOUD_NAME)).toBe(VALID_URL);
  });

  it("trims surrounding whitespace", () => {
    expect(validateReturnPhotoUrl(`  ${VALID_URL}  `, CLOUD_NAME)).toBe(VALID_URL);
  });

  it("rejects an attacker-controlled host planted to fire a tracking request", () => {
    expect(() =>
      validateReturnPhotoUrl("https://evil.example.com/tracker.png", CLOUD_NAME),
    ).toThrow(ActionError);
  });

  it("rejects a Cloudinary look-alike host (subdomain confusion)", () => {
    expect(() =>
      validateReturnPhotoUrl(
        `https://res.cloudinary.com.evil.com/${CLOUD_NAME}/image/upload/x.jpg`,
        CLOUD_NAME,
      ),
    ).toThrow(ActionError);
  });

  it("rejects a URL for a different Cloudinary cloud name", () => {
    expect(() =>
      validateReturnPhotoUrl(
        "https://res.cloudinary.com/someone-elses-cloud/image/upload/x.jpg",
        CLOUD_NAME,
      ),
    ).toThrow(ActionError);
  });

  it("rejects non-https protocols", () => {
    expect(() =>
      validateReturnPhotoUrl(
        `http://res.cloudinary.com/${CLOUD_NAME}/image/upload/x.jpg`,
        CLOUD_NAME,
      ),
    ).toThrow(ActionError);
    expect(() =>
      validateReturnPhotoUrl(
        `javascript:alert(1)//res.cloudinary.com/${CLOUD_NAME}/image/upload/`,
        CLOUD_NAME,
      ),
    ).toThrow(ActionError);
  });

  it("rejects a Cloudinary URL under a different resource type/path shape", () => {
    expect(() =>
      validateReturnPhotoUrl(
        `https://res.cloudinary.com/${CLOUD_NAME}/raw/upload/x.pdf`,
        CLOUD_NAME,
      ),
    ).toThrow(ActionError);
  });

  it("rejects an empty or malformed URL", () => {
    expect(() => validateReturnPhotoUrl("", CLOUD_NAME)).toThrow(ActionError);
    expect(() => validateReturnPhotoUrl("not a url", CLOUD_NAME)).toThrow(ActionError);
  });

  it("rejects an overlong URL", () => {
    const long = VALID_URL + "a".repeat(2000);
    expect(() => validateReturnPhotoUrl(long, CLOUD_NAME)).toThrow(ActionError);
  });

  it("fails closed when the cloud name env var is unset", () => {
    expect(() => validateReturnPhotoUrl(VALID_URL, undefined)).toThrow(ActionError);
  });
});
