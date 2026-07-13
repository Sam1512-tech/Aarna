import type { Metadata } from "next";
import { AccountAddressesView } from "@/components/storefront/account-addresses-view";
import { getMyAddresses } from "@/lib/actions/account";

export const metadata: Metadata = {
  title: "Your addresses",
};

export default async function AccountAddressesPage() {
  const addresses = await getMyAddresses().catch(() => []);
  return (
    <AccountAddressesView
      addresses={addresses.map((a) => ({
        id: a.id,
        fullName: a.fullName,
        phone: a.phone,
        line1: a.line1,
        line2: a.line2 ?? undefined,
        city: a.city,
        state: a.state,
        pincode: a.pincode,
        isDefault: a.isDefault,
      }))}
    />
  );
}
