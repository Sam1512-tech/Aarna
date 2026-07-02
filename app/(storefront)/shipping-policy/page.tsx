import type { Metadata } from "next";
import { LegalList, LegalPage } from "@/components/storefront/legal-page";

export const metadata: Metadata = {
  title: "shipping policy",
  description:
    "How Aarna ships your slow-made pieces — processing times, tracking, and delivery timelines across India.",
};

export default function ShippingPolicyPage() {
  return (
    <LegalPage
      eyebrow="policies"
      title="Shipping Policy"
      intro="Every Aarna piece is prepared with care before it makes its way to you. Here's what to expect once you place an order."
    >
      <LegalList
        items={[
          "Orders are processed within 1–2 business days.",
          "Once shipped, delivery timelines may vary based on the customer's location.",
          "Customers will receive tracking details via email/SMS once the order is dispatched.",
          "Delays caused by courier partners, natural calamities, or unforeseen circumstances are beyond our control.",
        ]}
      />
    </LegalPage>
  );
}
