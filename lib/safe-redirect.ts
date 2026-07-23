/**
 * Validates a client-supplied redirect target is a same-origin relative
 * path, safe to pass to NextResponse.redirect(new URL(path, origin)) or a
 * client-side router.push(path). Used after auth flows (email verification,
 * OAuth, magic links) where the `next`/`redirect` query param comes from an
 * attacker-controlled URL, not anything the app itself generated.
 *
 * A leading "//" is an explicit protocol-relative redirect and was already
 * rejected everywhere this ran. A leading "/\" is a less obvious bypass of
 * that exact check: the WHATWG URL parser normalizes a backslash to a
 * forward slash for http(s) schemes, so "/\evil.com" resolves to
 * "https://evil.com/" once passed through `new URL(path, origin)` —
 * verified directly, not just read. Rejecting any backslash anywhere in the
 * value closes this without narrowing what a legitimate internal path ever
 * needs to contain (none of this app's routes use one).
 */
export function safeRedirectPath(
  next: string | null | undefined,
  fallback: string,
): string {
  if (
    next &&
    next.startsWith("/") &&
    !next.startsWith("//") &&
    !next.includes("\\")
  ) {
    return next;
  }
  return fallback;
}
