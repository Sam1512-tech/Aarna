import Link from "next/link";

export default function HomePage() {
  return (
    <>
      <section className="relative overflow-hidden bg-sand/40">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-6 py-24 md:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-warm-grey">
              New Collection
            </p>
            <h1 className="mt-4 font-display text-6xl leading-tight text-ink md:text-7xl">
              Effortless
              <br />
              Silhouettes
            </h1>
            <p className="mt-6 max-w-md text-base leading-relaxed text-ink/70">
              Thoughtfully designed for every chapter of your life.
            </p>
            <Link
              href="/shop/new-arrivals"
              className="mt-10 inline-block border border-ink px-8 py-3 text-xs uppercase tracking-[0.3em] text-ink transition hover:bg-ink hover:text-ivory"
            >
              Explore Now
            </Link>
          </div>
          <div className="aspect-[3/4] rounded-sm bg-taupe/40" />
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-20">
        <h2 className="text-center font-display text-3xl text-ink">
          Shop by Category
        </h2>
        <div className="mt-12 grid grid-cols-2 gap-6 md:grid-cols-5">
          {["Dresses", "Co-ord Sets", "Kurta Sets", "Jackets", "Tops & Tunics"].map(
            (label) => (
              <Link
                key={label}
                href={`/shop/${label.toLowerCase().replace(/\s|&/g, "-")}`}
                className="group block"
              >
                <div className="aspect-[3/4] bg-sand/50 transition group-hover:bg-sand" />
                <p className="mt-3 text-center text-xs uppercase tracking-[0.25em] text-ink">
                  {label}
                </p>
              </Link>
            ),
          )}
        </div>
      </section>

      <section className="border-y border-sand/60 bg-ivory/60">
        <div className="mx-auto grid max-w-7xl gap-8 px-6 py-12 text-center text-xs uppercase tracking-[0.2em] text-ink/70 md:grid-cols-4">
          <div>
            <p className="font-medium text-ink">Complimentary Shipping</p>
            <p className="mt-1 normal-case tracking-normal">
              On orders above ₹2999
            </p>
          </div>
          <div>
            <p className="font-medium text-ink">Easy Returns</p>
            <p className="mt-1 normal-case tracking-normal">
              14-day return policy
            </p>
          </div>
          <div>
            <p className="font-medium text-ink">Premium Fabrics</p>
            <p className="mt-1 normal-case tracking-normal">
              Quality you can feel
            </p>
          </div>
          <div>
            <p className="font-medium text-ink">Secure Checkout</p>
            <p className="mt-1 normal-case tracking-normal">
              Multiple payment options
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
