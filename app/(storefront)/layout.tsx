import Link from "next/link";

export default function StorefrontLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-sand/60 bg-ivory/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <Link
            href="/"
            className="font-display text-2xl tracking-[0.25em] text-maroon"
          >
            AARNA
          </Link>
          <nav className="hidden items-center gap-8 text-xs font-medium uppercase tracking-[0.2em] text-ink/80 md:flex">
            <Link href="/shop/new-arrivals">New Arrivals</Link>
            <Link href="/shop/dresses">Dresses</Link>
            <Link href="/shop/co-ord-sets">Co-ord Sets</Link>
            <Link href="/shop/kurta-sets">Kurta Sets</Link>
            <Link href="/shop/jackets">Jackets</Link>
            <Link href="/shop/sale">Sale</Link>
          </nav>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/account" aria-label="Account">
              Account
            </Link>
            <Link href="/cart" aria-label="Cart">
              Cart
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-sand/60 bg-ivory/60">
        <div className="mx-auto max-w-7xl px-6 py-12 text-sm text-warm-grey">
          <p className="font-display text-2xl tracking-[0.25em] text-maroon">
            AARNA
          </p>
          <p className="mt-2 italic">Minimal. Modern. Refined.</p>
          <p className="mt-6 text-xs">
            © {new Date().getFullYear()} Aarna. All rights reserved.
          </p>
        </div>
      </footer>
    </>
  );
}
