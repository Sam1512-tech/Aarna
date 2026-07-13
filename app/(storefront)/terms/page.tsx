import type { Metadata } from "next";
import { LegalList, LegalPage } from "@/components/storefront/legal-page";

export const metadata: Metadata = {
  title: "Terms of service",
  description:
    "The terms that govern shopping with Aarna — pricing, policy updates, and misuse of the website.",
};

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow="policies"
      title="Terms of Service"
      intro="By shopping with Aarna, you agree to the terms below. They keep the experience fair for our community and consistent for our team."
    >
      <LegalList
        items={[
          "By placing an order with Aarna, customers agree to our policies and terms.",
          "Product colors may slightly vary due to lighting and screen settings.",
          "Aarna reserves the right to update pricing, policies, and product availability at any time.",
          "Any misuse of the website or fraudulent activity may result in cancellation of orders.",
        ]}
      />
    </LegalPage>
  );
}
