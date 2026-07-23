import type { Metadata } from "next";
import { SignupView } from "@/components/storefront/signup-view";
import { safeRedirectPath } from "@/lib/safe-redirect";

export const metadata: Metadata = {
  title: "Create account",
};

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; redirect?: string }>;
}) {
  const params = await searchParams;
  const safeNext = safeRedirectPath(params.next ?? params.redirect, "/account");
  return <SignupView nextPath={safeNext} />;
}
