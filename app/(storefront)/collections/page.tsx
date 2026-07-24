import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getCollections } from "@/lib/actions/products";
import { safeDbRead, SAFE_DB_READ_TIMEOUT_MS } from "@/lib/db/safe-query";

export const metadata: Metadata = {
  title: "Collections",
  description: "Explore curated collections from Aarna by Arpitha Abhishek.",
};

export default async function CollectionsPage() {
  // Timeout-guarded so a pooler hang can't stall this static page's build
  // render and fail the deploy (see lib/db/safe-query.ts). Empty state below
  // already covers a no-collections result, which is also the launch default.
  const collections = await safeDbRead(getCollections(), {
    timeoutMs: SAFE_DB_READ_TIMEOUT_MS,
    fallback: [],
    label: "collections list",
  });

  return (
    <section className="bg-cream px-6 pb-16 pt-[128px] md:pb-24 md:pt-36">
      <div className="mx-auto max-w-7xl">
        <p className="text-sm font-bold uppercase tracking-[0.24em] text-cocoa">
          Curated for you
        </p>
        <h1 className="mt-4 font-display text-[42px] leading-[1.1] text-maroon">
          Collections
        </h1>

        {collections.length > 0 ? (
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {collections.map((collection) => (
              <Link
                key={collection.slug}
                href={`/collections/${collection.slug}`}
                className="group block"
              >
                {collection.heroImageUrl ? (
                  <div className="relative aspect-[4/5] overflow-hidden shadow-[0_18px_55px_rgba(43,38,35,0.07)]">
                    <Image
                      src={collection.heroImageUrl}
                      alt={collection.name}
                      fill
                      sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                      className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                    />
                  </div>
                ) : (
                  <div className="cloth-window aspect-[4/5] shadow-[0_18px_55px_rgba(43,38,35,0.07)]" />
                )}
                <p className="mt-4 font-display text-3xl leading-tight text-maroon">
                  {collection.name}
                </p>
                {collection.description ? (
                  <p className="mt-1 text-sm leading-6 text-charcoal/60">
                    {collection.description}
                  </p>
                ) : null}
              </Link>
            ))}
          </div>
        ) : (
          <div className="mt-10 border border-cocoa/12 bg-cocoa/10 px-6 py-10 text-charcoal/64">
            <p className="max-w-xl text-base leading-8">
              The first collections are being pieced together by hand —
              check back soon.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
