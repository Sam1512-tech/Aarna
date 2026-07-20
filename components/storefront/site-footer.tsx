import Image from "next/image";
import Link from "next/link";

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
          <p className="mt-4 text-base text-charcoal/54">
            (c) 2026 Aarna by Arpitha Abhishek. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
