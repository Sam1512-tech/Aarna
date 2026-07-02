import { redirect } from "next/navigation";

/**
 * The Aarna storefront uses passwordless email-OTP as the sole sign-in method.
 * /login exists only to forward incoming links (from middleware, footer, etc.)
 * to /login/otp, preserving whatever redirect target the caller passed.
 *
 * Accepts both ?redirect= (what middleware.ts sends) and ?next= (what the
 * storefront tends to send) for flexibility.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; redirect?: string }>;
}) {
  const params = await searchParams;
  const target = params.next ?? params.redirect;
  // Only allow same-origin relative paths.
  const safeNext =
    target && target.startsWith("/") && !target.startsWith("//")
      ? target
      : "/account";
  redirect(`/login/otp?next=${encodeURIComponent(safeNext)}`);
}
