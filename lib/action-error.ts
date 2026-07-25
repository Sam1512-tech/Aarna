/**
 * Next.js strips the `message` off any error thrown from a server action in
 * production builds ("An error occurred in the Server Components render…"),
 * so friendly validation errors like `Slug "x" is already taken` never reach
 * the client. The one property Next forwards verbatim is `digest` — so
 * ActionError carries its message there, and `actionErrorMessage()` recovers
 * it on the client.
 *
 * Use ActionError ONLY for messages that are safe to show the user. Anything
 * unexpected (DB failures etc.) should stay a plain Error so it remains
 * masked in production.
 */

const DIGEST_PREFIX = "AARNA_ACTION_ERROR;";

export class ActionError extends Error {
  digest: string;

  constructor(message: string) {
    super(message);
    this.name = "ActionError";
    this.digest = DIGEST_PREFIX + message;
  }
}

/**
 * Client-side counterpart: pulls the real message out of an error thrown by a
 * server action, falling back to `fallback` for unexpected/masked errors.
 *
 *   catch (err) {
 *     setError(actionErrorMessage(err, "Couldn't create product."));
 *   }
 */
export function actionErrorMessage(err: unknown, fallback: string): string {
  if (typeof err === "object" && err !== null && "digest" in err) {
    const digest = (err as { digest?: unknown }).digest;
    if (typeof digest === "string" && digest.startsWith(DIGEST_PREFIX)) {
      return digest.slice(DIGEST_PREFIX.length);
    }
  }
  return fallback;
}
