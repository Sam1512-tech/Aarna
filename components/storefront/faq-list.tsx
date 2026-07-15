import { Plus } from "lucide-react";

/**
 * Accordion list used on the FAQ page. Uses native <details>/<summary> so it
 * stays a server component and works without JavaScript. The plus icon
 * rotates 45° when open to become an ×.
 */
export function FaqList({ children }: { children: React.ReactNode }) {
  return <ul className="divide-y divide-cocoa/12 border-y border-cocoa/12">{children}</ul>;
}

export function FaqItem({
  question,
  children,
}: {
  question: string;
  children: React.ReactNode;
}) {
  return (
    <li>
      <details className="group">
        <summary className="flex cursor-pointer list-none items-start justify-between gap-6 py-6 transition duration-500 hover:text-cocoa [&::-webkit-details-marker]:hidden">
          <span className="font-display text-xl leading-snug text-maroon md:text-2xl">
            {question}
          </span>
          <span
            aria-hidden="true"
            className="mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-cocoa/22 text-cocoa transition duration-500 group-open:rotate-45 group-open:bg-cocoa group-open:text-cream"
          >
            <Plus className="h-4 w-4" />
          </span>
        </summary>
        <div className="pb-7 pr-14 text-base leading-8 text-charcoal/72">
          {children}
        </div>
      </details>
    </li>
  );
}
