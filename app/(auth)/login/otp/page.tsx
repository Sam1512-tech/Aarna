import type { Metadata } from "next";
import { LoginOtpView } from "@/components/storefront/login-otp-view";
import { safeRedirectPath } from "@/lib/safe-redirect";

export const metadata: Metadata = {
  title: "Sign in",
};

export default async function LoginOtpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; email?: string }>;
}) {
  const { next, email } = await searchParams;
  // Same validation /login and /signup already apply — without it, ?next=
  // flows straight into router.push() after a successful verify, which is an
  // open redirect (//evil.com and /\evil.com both resolve cross-origin).
  const safeNext = safeRedirectPath(next, "/checkout");
  return (
    <LoginOtpView nextPath={safeNext} initialEmail={email || undefined} />
  );
}
