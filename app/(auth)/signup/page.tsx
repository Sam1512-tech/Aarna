import { redirect } from "next/navigation";

/**
 * There is no separate signup flow — the email-OTP flow at /login/otp creates
 * an account automatically on first successful verification. /signup exists
 * only to forward any lingering links (footer, external, etc.) into it.
 */
export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; redirect?: string }>;
}) {
  const params = await searchParams;
  const target = params.next ?? params.redirect;
  const safeNext =
    target && target.startsWith("/") && !target.startsWith("//")
      ? target
      : "/account";
  redirect(`/login/otp?next=${encodeURIComponent(safeNext)}`);
}
