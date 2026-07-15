import type { Metadata } from "next";
import { LoginOtpView } from "@/components/storefront/login-otp-view";

export const metadata: Metadata = {
  title: "Sign in",
};

export default async function LoginOtpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; email?: string }>;
}) {
  const { next, email } = await searchParams;
  return (
    <LoginOtpView nextPath={next ?? "/checkout"} initialEmail={email || undefined} />
  );
}
