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
  { href: "/shipping-policy", label: "shipping policy" },
  { href: "/return-policy", label: "return policy" },
  { href: "/privacy-policy", label: "privacy policy" },
  { href: "/terms", label: "terms of service" },
  { href: "/contact", label: "contact" },
];

const resourceLinks = [
  { href: "/journal", label: "journal" },
  { href: "/fabric-care", label: "fabric care guide" },
  { href: "/about", label: "about" },
];

export function SiteFooter({ categories }: SiteFooterProps) {
  return (
    <footer className="paper-grain border-t border-cocoa/12 bg-cream text-maroon">
      <div className="mx-auto max-w-7xl px-6 py-16 md:py-20">
        <div className="grid gap-10 border-b border-maroon/14 pb-12 md:grid-cols-[1.1fr_0.9fr] md:items-end">
          <div>
            <h2 className="max-w-2xl font-display text-5xl lowercase leading-[1.08] md:text-7xl">
              from our wardrobe to your everyday rituals.
            </h2>
            <p className="mt-6 max-w-2xl text-lg leading-9 text-charcoal/68">
              Sign up for quiet collection notes, styling rituals, fabric care,
              and community stories from Aarna.
            </p>
          </div>
          <form className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <label className="sr-only" htmlFor="footer-email">
              Email address
            </label>
            <input
              id="footer-email"
              type="email"
              placeholder="email address"
              className="min-h-12 border border-cocoa/18 bg-cream px-4 text-base lowercase text-charcoal outline-none transition duration-700 placeholder:text-charcoal/45 focus:border-cocoa"
            />
            <button
              type="submit"
              className="min-h-12 bg-cocoa px-6 text-xs font-medium lowercase tracking-[0.24em] text-white transition duration-1000 hover:bg-cocoa/85"
            >
              sign up
            </button>
          </form>
        </div>

        <div className="grid gap-10 py-12 md:grid-cols-[1.1fr_0.9fr_0.9fr_0.9fr]">
          <div>
            <h3 className="text-base font-bold uppercase tracking-[0.24em] text-charcoal/64">
              aarna
            </h3>
            <p className="mt-5 max-w-sm text-lg leading-9 text-charcoal/70">
              A slow-made clothing line for intimate gatherings, travel,
              layering, and clothes that stay with you.
            </p>
          </div>

          <div>
            <h3 className="text-base font-bold uppercase tracking-[0.24em] text-charcoal/64">
              policies
            </h3>
            <div className="mt-5 flex flex-col gap-3 text-lg lowercase leading-7 text-charcoal/72">
              {policyLinks.map((link) => (
                <Link key={link.href} href={link.href} className="soft-link w-fit">
                  {link.label}
                </Link>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-base font-bold uppercase tracking-[0.24em] text-charcoal/64">
              shop
            </h3>
            <div className="mt-5 flex flex-col gap-3 text-lg lowercase leading-7 text-charcoal/72">
              <Link href="/shop/new-arrivals" className="soft-link w-fit">
                new chapter
              </Link>
              {categories.map((category) => (
                <Link
                  key={category.slug}
                  href={`/shop/${category.slug}`}
                  className="soft-link w-fit"
                >
                  {category.name.toLowerCase()}
                </Link>
              ))}
              <Link href="/collections" className="soft-link w-fit">
                collections
              </Link>
            </div>
          </div>

          <div>
            <h3 className="text-base font-bold uppercase tracking-[0.24em] text-charcoal/64">
              resources
            </h3>
            <div className="mt-5 flex flex-col gap-3 text-lg lowercase leading-7 text-charcoal/72">
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
          <p className="mt-6 text-lg lowercase text-charcoal/68">
            slow-made clothing, delivered across india.
          </p>
          <p className="mt-4 text-base lowercase text-charcoal/54">
            (c) 2026 Aarna by Arpitha Abhishek. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
