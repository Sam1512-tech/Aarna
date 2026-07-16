"use client";

export interface VariantOption {
  variantId: string;
  size: string | null;
  color: string | null;
  sku: string;
  stock: number;
  isCurrentVariant: boolean;
}

export interface ExchangeVariantChooserProps {
  variants: VariantOption[];
  selectedVariantId: string | null;
  onSelect: (variantId: string) => void;
  /** Loading state — shown while the parent fetches variants for the product. */
  loading?: boolean;
}

/**
 * Chip-based chooser for exchange targets. Only in-stock variants (stock > 0)
 * are selectable; the current variant is grayed out (you can't exchange for
 * what you already have); out-of-stock variants show a strikethrough label.
 *
 * PR 2 wires this via `getVariantsInStockForProduct(productId)` from
 * lib/actions/products.ts.
 */
export function ExchangeVariantChooser({
  variants,
  selectedVariantId,
  onSelect,
  loading = false,
}: ExchangeVariantChooserProps) {
  if (loading) {
    return (
      <div className="mt-2 flex flex-wrap gap-2">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-9 w-20 animate-pulse rounded-full bg-cocoa/8"
          />
        ))}
      </div>
    );
  }

  if (variants.length === 0) {
    return (
      <p className="mt-2 rounded-xl border border-cocoa/12 bg-cocoa/6 px-4 py-3 text-xs leading-5 text-charcoal/60">
        no other sizes or variants are available for this piece right now.
        please pick a return instead, or reach out to us for options.
      </p>
    );
  }

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {variants.map((v) => {
        const outOfStock = v.stock === 0;
        const current = v.isCurrentVariant;
        const disabled = outOfStock || current;
        const active = v.variantId === selectedVariantId;
        const label = [v.size, v.color].filter(Boolean).join(" · ") || v.sku;

        return (
          <button
            key={v.variantId}
            type="button"
            onClick={() => !disabled && onSelect(v.variantId)}
            disabled={disabled}
            aria-pressed={active}
            className={`flex flex-col items-start gap-0.5 rounded-2xl border px-3.5 py-2 text-left text-xs transition duration-500 ${
              active
                ? "border-maroon bg-maroon text-cream shadow-[0_8px_20px_rgba(74,31,31,0.18)]"
                : current
                  ? "cursor-not-allowed border-cocoa/12 bg-cocoa/6 text-charcoal/40"
                  : outOfStock
                    ? "cursor-not-allowed border-cocoa/12 bg-cream text-charcoal/35 line-through"
                    : "border-cocoa/22 bg-cream text-charcoal/72 hover:border-cocoa"
            }`}
          >
            <span className="font-medium lowercase">{label}</span>
            <span
              className={`text-[10px] uppercase tracking-[0.12em] ${
                active
                  ? "text-cream/80"
                  : current
                    ? "text-charcoal/40"
                    : "text-charcoal/45"
              }`}
            >
              {current
                ? "your current pick"
                : outOfStock
                  ? "out of stock"
                  : v.stock <= 2
                    ? `${v.stock} left`
                    : "available"}
            </span>
          </button>
        );
      })}
    </div>
  );
}
