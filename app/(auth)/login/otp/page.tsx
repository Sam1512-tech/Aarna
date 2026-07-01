import type { Metadata } from "next";
import { LoginOtpView } from "@/components/storefront/login-otp-view";

export const metadata: Metadata = {
  title: "sign in",
};

export default async function LoginOtpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return <LoginOtpView nextPath={next ?? "/checkout"} />;
}
