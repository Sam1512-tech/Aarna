import type { Metadata } from "next";
import { SignupView } from "@/components/storefront/signup-view";

export const metadata: Metadata = {
  title: "Create account",
};

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
  return <SignupView nextPath={safeNext} />;
}
