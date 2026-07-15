import type { Metadata } from "next";
import { LegalList, LegalPage } from "@/components/storefront/legal-page";

export const metadata: Metadata = {
  title: "Privacy policy",
  description:
    "How Aarna handles and safeguards customer information — what we collect, why, and what we never share.",
};

export default function PrivacyPolicyPage() {
  return (
    <LegalPage
      eyebrow="policies"
      title="Privacy Policy"
      intro="Your trust matters to us. Here's a plain-language summary of how we handle the information you share with Aarna."
    >
      <LegalList
        items={[
          "Customer information shared with Aarna is kept secure and confidential.",
          "Personal details such as name, address, email, and phone number are collected only for order processing and customer support purposes.",
          "We do not sell or share customer data with third parties except trusted delivery/payment partners required for order fulfillment.",
        ]}
      />
    </LegalPage>
  );
}
