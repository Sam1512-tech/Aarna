import type { Metadata } from "next";
import { LoginView } from "@/components/storefront/login-view";
import { safeRedirectPath } from "@/lib/safe-redirect";

export const metadata: Metadata = {
  title: "Sign in",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; redirect?: string; error?: string }>;
}) {
  const params = await searchParams;
  const safeNext = safeRedirectPath(params.next ?? params.redirect, "/account");
  return <LoginView nextPath={safeNext} initialError={params.error} />;
}
