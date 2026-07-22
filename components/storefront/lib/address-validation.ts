"use client";

/**
 * Address anti-scam heuristics. Client-side only — server-side rules live in
 * lib/actions/* and are Sam's. These are cheap sanity checks to catch obvious
 * garbage / scam addresses before we submit.
 */

/** Indian mobile numbers are 10 digits and start with 6, 7, 8, or 9. */
export function isValidIndianPhone(phone: string): boolean {
  return /^[6-9]\d{9}$/.test(phone.trim());
}

/**
 * A believable person name: at least two space-separated tokens, each 2+
 * characters, letters only (allowing hyphens and apostrophes). Blocks
 * "asdf", "1234", and single-word garbage like "test".
 */
export function isValidPersonName(name: string): boolean {
  const trimmed = name.trim();
  if (trimmed.length < 3) return false;
  const tokens = trimmed.split(/\s+/);
  if (tokens.length < 2) return false;
  return tokens.every(
    (t) => t.length >= 2 && /^[\p{L}][\p{L}'’.-]*$/u.test(t),
  );
}

/**
 * Street address line: at least 8 chars, contains at least one letter AND
 * one digit (real Indian addresses almost always mix — a house number and
 * a road name). Catches "aaaaaaaa", "asdfasdf", "test address" etc.
 */
export function isPlausibleAddressLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length < 8) return false;
  if (!/[\p{L}]/u.test(trimmed)) return false;
  if (!/\d/.test(trimmed)) return false;
  // No 5+ consecutive identical chars (aaaaa, 11111)
  if (/(.)\1{4,}/.test(trimmed)) return false;
  return true;
}

/** India Post pincode lookup response — result of the free public API. */
export interface PincodeDetails {
  ok: boolean;
  state?: string;
  district?: string;
}

/**
 * Ask India Post what state / district a pincode is in. Client-only fetch
 * to the free public endpoint. Used to cross-check that the state a user
 * typed matches their pincode — a fraudulent order that pastes a random
 * Karnataka pincode into a Delhi address gets caught here.
 *
 * Fail-open: if the API is down or blocks CORS, this returns { ok: false }
 * and the caller falls back to the pincode-serviceability check alone. We
 * never want a legit customer stopped by a third-party outage.
 */
export async function fetchPincodeDetails(
  pincode: string,
): Promise<PincodeDetails> {
  if (!/^\d{6}$/.test(pincode)) return { ok: false };
  try {
    const res = await fetch(
      `https://api.postalpincode.in/pincode/${pincode}`,
      { cache: "no-store" },
    );
    if (!res.ok) return { ok: false };
    const data = await res.json();
    const entry = Array.isArray(data) ? data[0] : null;
    if (!entry || entry.Status !== "Success") return { ok: false };
    const first = entry.PostOffice?.[0];
    if (!first) return { ok: false };
    return {
      ok: true,
      state: typeof first.State === "string" ? first.State : undefined,
      district: typeof first.District === "string" ? first.District : undefined,
    };
  } catch {
    return { ok: false };
  }
}

/**
 * Loose state name equality — accounts for common casing, whitespace, and
 * punctuation differences ("tamil nadu" vs "Tamil Nadu", "j & k" vs "Jammu
 * and Kashmir" is out of scope; typos aren't the target here, obvious
 * mismatches are).
 */
export function statesMatch(a: string, b: string): boolean {
  const normalize = (s: string) =>
    s
      .trim()
      .toLowerCase()
      .replace(/[.&,]/g, " ")
      .replace(/\s+/g, " ");
  return normalize(a) === normalize(b);
}
