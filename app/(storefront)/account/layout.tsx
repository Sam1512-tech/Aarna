import { redirect } from "next/navigation";
import { AccountShell } from "@/components/storefront/account-shell";
import { getCurrentCustomer } from "@/lib/actions/auth";

export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Middleware already redirects unauthenticated visitors to /login. This is a
  // defensive belt-and-braces check + gives us the customer to render.
  const customer = await getCurrentCustomer();
  if (!customer) {
    redirect("/login?next=/account");
  }

  // `||`, not `??` — an account created via OTP/Google can end up with
  // fullName as an empty string rather than null (no name was ever
  // collected), and `??` only falls through on null/undefined.
  const displayName =
    customer.fullName || customer.email?.split("@")[0] || "friend";

  return <AccountShell displayName={displayName}>{children}</AccountShell>;
}
