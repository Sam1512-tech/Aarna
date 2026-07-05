import type { Metadata } from "next";
import { LegalPage } from "@/components/storefront/legal-page";
import { FaqItem, FaqList } from "@/components/storefront/faq-list";

export const metadata: Metadata = {
  title: "frequently asked questions",
  description:
    "Answers to common questions about Aarna — what makes us different, sizing, materials, delivery, and why to shop with us.",
};

export default function FaqPage() {
  return (
    <LegalPage
      eyebrow="help"
      title="Frequently Asked Questions"
      intro="A few things people often ask us. If your question isn't here, we'd love to hear from you."
    >
      <FaqList>
        <FaqItem question="What makes your brand different?">
          <p>
            We&rsquo;re a new clothing brand focused on creating stylish,
            high-quality essentials with attention to comfort, fit, and
            timeless design. Every piece is made to help you look and feel
            your best.
          </p>
        </FaqItem>

        <FaqItem question="How do I choose the right size?">
          <p>
            Each product includes a detailed size guide to help you find your
            perfect fit. If you&rsquo;re between sizes or need assistance,
            feel free to contact us before placing your order.
          </p>
        </FaqItem>

        <FaqItem question="Are your products made with quality materials?">
          <p>
            Yes. We carefully select fabrics that offer comfort, durability,
            and a premium feel, ensuring every piece meets our quality
            standards.
          </p>
        </FaqItem>

        <FaqItem question="How long will it take to receive my order?">
          <p>
            Orders are processed as quickly as possible and shipped within
            our standard processing time. Once your order is dispatched,
            you&rsquo;ll receive tracking details to monitor your delivery.
          </p>
        </FaqItem>

        <FaqItem question="Why should I shop with your brand?">
          <p>
            As a new brand, we&rsquo;re committed to earning your trust
            through quality products, transparent service, and a great
            customer experience. Your satisfaction is our top priority.
          </p>
        </FaqItem>
      </FaqList>
    </LegalPage>
  );
}
