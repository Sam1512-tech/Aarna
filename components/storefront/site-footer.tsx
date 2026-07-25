import Image from "next/image";
import Link from "next/link";
import { CONTACT_WHATSAPP_URL, INSTAGRAM_URL } from "@/lib/contact-info";

interface CategoryLink {
  name: string;
  slug: string;
}

interface SiteFooterProps {
  categories: CategoryLink[];
}

const policyLinks = [
  { href: "/shipping-policy", label: "Shipping policy" },
  { href: "/return-policy", label: "Return policy" },
  { href: "/privacy-policy", label: "Privacy policy" },
  { href: "/terms", label: "Terms of service" },
  { href: "/contact", label: "Contact" },
];

const resourceLinks = [
  { href: "/fabric-care", label: "Fabric care guide" },
  { href: "/faq", label: "FAQ" },
];

export function SiteFooter({ categories }: SiteFooterProps) {
  return (
    <footer className="paper-grain border-t border-cocoa/12 bg-cream text-maroon">
      <div className="mx-auto max-w-7xl px-6 py-16 md:py-20">
        <div className="border-b border-maroon/14 pb-12">
          <h2 className="max-w-2xl font-display text-5xl leading-[1.08] md:text-7xl">
            From our wardrobe to your everyday rituals.
          </h2>
        </div>

        <div className="grid gap-10 py-12 md:grid-cols-[1.1fr_0.9fr_0.9fr_0.9fr]">
          <div>
            <h3 className="text-base font-bold uppercase tracking-[0.24em] text-charcoal/64">
              Aarna
            </h3>
            <p className="mt-5 max-w-sm text-lg leading-9 text-charcoal/70">
              A slow-made clothing line for intimate gatherings, travel,
              layering, and clothes that stay with you.
            </p>
          </div>

          <div>
            <h3 className="text-base font-bold uppercase tracking-[0.24em] text-charcoal/64">
              Policies
            </h3>
            <div className="mt-5 flex flex-col gap-3 text-lg leading-7 text-charcoal/72">
              {policyLinks.map((link) => (
                <Link key={link.href} href={link.href} className="soft-link w-fit">
                  {link.label}
                </Link>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-base font-bold uppercase tracking-[0.24em] text-charcoal/64">
              Shop
            </h3>
            <div className="mt-5 flex flex-col gap-3 text-lg leading-7 text-charcoal/72">
              <Link href="/shop" className="soft-link w-fit">
                The wardrobe
              </Link>
              {categories.map((category) => (
                <Link
                  key={category.slug}
                  href={`/shop/${category.slug}`}
                  className="soft-link w-fit"
                >
                  {category.name}
                </Link>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-base font-bold uppercase tracking-[0.24em] text-charcoal/64">
              Resources
            </h3>
            <div className="mt-5 flex flex-col gap-3 text-lg leading-7 text-charcoal/72">
              {resourceLinks.map((link) => (
                <Link key={link.href} href={link.href} className="soft-link w-fit">
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        </div>

        <div className="border-t border-maroon/14 pt-10 text-center">
          <Image
            src="/brand/aarna-footer-logo-transparent.png"
            alt="Aarna by Arpitha Abhishek"
            width={640}
            height={420}
            className="logo-blend mx-auto w-full max-w-[320px] object-contain md:max-w-[430px]"
          />
          <p className="mt-6 text-lg text-charcoal/68">
            Slow-made clothing, delivered across India.
          </p>

          <div className="mt-6 flex items-center justify-center gap-5 text-cocoa">
            <a
              href={INSTAGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Aarna on Instagram"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full transition duration-500 hover:bg-cocoa/10 hover:text-maroon"
            >
              <InstagramGlyph />
            </a>
            <a
              href={CONTACT_WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Chat with Aarna on WhatsApp"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full transition duration-500 hover:bg-cocoa/10 hover:text-maroon"
            >
              <WhatsAppGlyph />
            </a>
          </div>

          <p className="mt-4 text-base text-charcoal/54">
            (c) 2026 Aarna by Arpitha Abhishek. All rights reserved.
          </p>
          <p className="mt-1 text-base text-charcoal/54">
            Crafted by{" "}
            <a
              href="https://www.solarisstudios.co.in"
              target="_blank"
              rel="noopener noreferrer"
              className="soft-link"
            >
              Solaris Studios
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}

// Simple monoline glyph matching lucide's own SVG conventions (24x24,
// stroke="currentColor", strokeWidth 2) so it sits visually consistent next
// to any real lucide icon — lucide itself ships neither brand mark.
function InstagramGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-[18px] w-[18px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="12" cy="12" r="4.2" />
      <circle cx="17.4" cy="6.6" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

// WhatsApp's own mark is a solid silhouette (bubble + handset), not a
// monoline icon, so stroking it like the Instagram glyph above rendered as
// scribble rather than a recognisable shape. Filled instead, same convention
// as GoogleGlyph in google-signin-button.tsx — the real brand path (Simple
// Icons, CC0), tinted via currentColor so it still pairs with the cocoa
// Instagram icon next to it.
function WhatsAppGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-[18px] w-[18px]"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
    </svg>
  );
}
