import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/storefront/legal-page";
import { FaqItem, FaqList } from "@/components/storefront/faq-list";

export const metadata: Metadata = {
  title: "Frequently asked questions",
  description:
    "Answers to common questions about Aarna — sizing, fabric care, shipping across India, returns, and payment.",
};

export default function FaqPage() {
  return (
    <LegalPage
      eyebrow="help"
      title="Frequently Asked Questions"
      intro="A few things people often ask before their first Aarna piece — sizing, care, shipping, returns. If your question isn’t here, we’d love to hear from you."
    >
      <FaqList>
        <FaqItem question="What kind of clothing does Aarna make?">
          <p>
            Aarna is a slow-made indo-western label. Each piece is designed for
            intimate gatherings, travel, layering, and clothes that stay with
            you across seasons — silhouettes drawn from Indian sensibilities,
            worn softly with everyday rituals.
          </p>
        </FaqItem>

        <FaqItem question="What sizes do you carry?">
          <p>
            Every product page lists the sizes available for that piece. If
            you&rsquo;re between sizes or unsure about fit, write to us at{" "}
            <Link href="/contact" className="soft-link text-cocoa">
              hello@shopaarna.in
            </Link>{" "}
            with your measurements and we&rsquo;ll guide you.
          </p>
        </FaqItem>

        <FaqItem question="How do I care for my Aarna pieces?">
          <p>
            Care instructions live on every product page and on the hang tag
            you receive with your order. As a rule: gentle washes, dry in
            shade, iron on low. Our{" "}
            <Link href="/fabric-care" className="soft-link text-cocoa">
              Fabric care guide
            </Link>{" "}
            walks through each fabric family in detail.
          </p>
        </FaqItem>

        <FaqItem question="Where do you ship?">
          <p>
            We currently ship across India only. International shipping is on
            our list, but not open yet — subscribe to the newsletter to be
            told first.
          </p>
        </FaqItem>

        <FaqItem question="How long does delivery take?">
          <p>
            Orders are dispatched from our Bengaluru studio within 2 business
            days. Delhivery, our courier partner, then delivers within{" "}
            <span className="font-medium text-maroon">4–7 business days</span>{" "}
            depending on your pincode. Metro pincodes are faster; remote
            pincodes may take a few days longer.
          </p>
        </FaqItem>

        <FaqItem question="What payment methods do you accept?">
          <p>
            All Indian cards, UPI, netbanking, and popular wallets — processed
            securely through Razorpay. We do{" "}
            <span className="font-medium text-maroon">not</span> offer cash on
            delivery at this time.
          </p>
        </FaqItem>

        <FaqItem question="Can I return or exchange an item?">
          <p>
            Yes — within{" "}
            <span className="font-medium text-maroon">3 days of delivery</span>,
            provided the piece is unused, unwashed, and returned with its
            original packaging and tags intact. Sale items are not eligible.
            Full details on our{" "}
            <Link href="/return-policy" className="soft-link text-cocoa">
              return &amp; exchange policy
            </Link>{" "}
            page.
          </p>
        </FaqItem>

        <FaqItem question="How do I track my order?">
          <p>
            Once your order ships you&rsquo;ll receive an email from Delhivery
            with a tracking link. You can also see the current status of any
            order in{" "}
            <Link href="/account/orders" className="soft-link text-cocoa">
              Your account
            </Link>
            .
          </p>
        </FaqItem>

        <FaqItem question="Do you restock sold-out styles?">
          <p>
            We work in small batches, so restocks depend on how the piece was
            received and whether the fabric is still available. Write to us if
            there&rsquo;s a specific style you&rsquo;re waiting for — we&rsquo;ll
            let you know if it&rsquo;s coming back.
          </p>
        </FaqItem>

        <FaqItem question="How can I reach you?">
          <p>
            The fastest way is our{" "}
            <Link href="/contact" className="soft-link text-cocoa">
              Contact page
            </Link>{" "}
            — we usually reply within a business day. For anything urgent
            about an existing order, quote your order number so we can find it
            quickly.
          </p>
        </FaqItem>
      </FaqList>
    </LegalPage>
  );
}
