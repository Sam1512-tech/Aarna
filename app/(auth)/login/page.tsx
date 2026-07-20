import type { Metadata } from "next";
import { LoginView } from "@/components/storefront/login-view";

export const metadata: Metadata = {
  title: "Sign in",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; redirect?: string; error?: string }>;
}) {
  const params = await searchParams;
  const target = params.next ?? params.redirect;
  const safeNext =
    target && target.startsWith("/") && !target.startsWith("//")
      ? target
      : "/account";
  return <LoginView nextPath={safeNext} initialError={params.error} />;
}
