import type { Metadata } from "next";
import { getCurrentCustomer } from "@/lib/actions/auth";
import { AccountProfileView } from "@/components/storefront/account-profile-view";

export const metadata: Metadata = {
  title: "Your profile",
};

export default async function AccountProfilePage() {
  const customer = await getCurrentCustomer();
  // Layout redirects if not logged in, but keep the null-check for the type.
  if (!customer) return null;

  return (
    <AccountProfileView
      fullName={customer.fullName ?? ""}
      phone={customer.phone ?? ""}
      whatsappOptIn={customer.whatsappOptIn}
    />
  );
}
