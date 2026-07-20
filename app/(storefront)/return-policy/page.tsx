import type { Metadata } from "next";
import { LegalList, LegalPage } from "@/components/storefront/legal-page";

export const metadata: Metadata = {
  title: "Return & exchange policy",
  description:
    "Aarna’s return and exchange terms — how the return window works and what makes a piece eligible.",
};

export default function ReturnPolicyPage() {
  return (
    <LegalPage
      eyebrow="policies"
      title="Return & Exchange Policy"
      intro="We want you to love every Aarna piece. If something isn’t right, here’s how returns and exchanges work."
    >
      <LegalList
        items={[
          "Returns and exchanges are accepted within 3 days of receiving the order.",
          "Products must be unused, unwashed, and returned in their original packaging with all tags intact.",
          "Items purchased during sale or promotional periods are not eligible for return or exchange.",
          "Refunds will be processed only after the product passes the quality check upon return.",
          <>
            In case of an incorrect or damaged product being delivered, customers
            are requested to contact us within{" "}
            <span className="font-medium text-maroon">24 hours of delivery</span>.
          </>,
        ]}
      />
    </LegalPage>
  );
}
