"use client";

import { useMemo, useState, useTransition } from "react";
import Image from "next/image";
import { Printer, Trash2, Plus } from "lucide-react";
import {
  Field,
  FormSection,
  FormShell,
  Select,
  SubmitBar,
  Textarea,
  TextInput,
  slugify,
} from "@/components/admin/admin-form";
import { CloudinaryImagePicker } from "@/components/admin/cloudinary-image-picker";
import { optimizedImageUrl } from "@/lib/media";
import {
  addProductImage,
  createVariant,
  deleteVariant,
  removeProductImage,
  updateProduct,
  updateVariant,
} from "@/lib/actions/admin/products";
import { actionErrorMessage } from "@/lib/action-error";
import { uploadAdminImage } from "@/lib/cloudinary/upload-client";

type ProductStatus = "draft" | "active" | "archived";

interface Variant {
  id: string;
  size: string;
  color: string;
  sku: string;
  price: number;
  stock: number;
  weightGrams: number | null;
  isActive: boolean;
}

interface Img {
  id: string;
  url: string;
  altText: string;
  sortOrder: number;
}

interface ProductDraft {
  id: string;
  title: string;
  slug: string;
  styleCode: string | null;
  description: string;
  fabric: string;
  washCare: string;
  basePrice: number;
  mrp: number | null;
  categoryId: string | null;
  status: ProductStatus;
  variants: Variant[];
  images: Img[];
}

function paiseToRupees(p: number) {
  return (p / 100).toString();
}
function rupeesToPaise(v: string) {
  const num = Number.parseFloat(v);
  if (!Number.isFinite(num) || num < 0) return NaN;
  return Math.round(num * 100);
}

export function ProductEditView({
  product: initial,
  categories,
}: {
  product: ProductDraft;
  categories: { id: string; name: string }[];
}) {
  const [product, setProduct] = useState(initial);

  return (
    <div className="mt-6 space-y-8">
      <BasicsForm
        product={product}
        categories={categories}
        onSaved={(p) => setProduct((prev) => ({ ...prev, ...p }))}
      />
      <VariantsSection
        productId={product.id}
        styleCode={product.styleCode}
        variants={product.variants}
        onChange={(variants) => setProduct((p) => ({ ...p, variants }))}
      />
      <ImagesSection
        productId={product.id}
        images={product.images}
        onChange={(images) => setProduct((p) => ({ ...p, images }))}
      />
      <PrintTagsCard variants={product.variants} />
    </div>
  );
}

// ── Basics form ──────────────────────────────────────────────────────────────

function BasicsForm({
  product,
  categories,
  onSaved,
}: {
  product: ProductDraft;
  categories: { id: string; name: string }[];
  onSaved: (fields: Partial<ProductDraft>) => void;
}) {
  const [title, setTitle] = useState(product.title);
  const [slug, setSlug] = useState(product.slug);
  const [description, setDescription] = useState(product.description);
  const [fabric, setFabric] = useState(product.fabric);
  const [washCare, setWashCare] = useState(product.washCare);
  const [priceRupees, setPriceRupees] = useState(paiseToRupees(product.basePrice));
  const [mrpRupees, setMrpRupees] = useState(
    product.mrp !== null ? paiseToRupees(product.mrp) : "",
  );
  const [categoryId, setCategoryId] = useState(product.categoryId ?? "");
  const [status, setStatus] = useState<ProductStatus>(product.status);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const priceValid = priceRupees.length > 0 && !Number.isNaN(rupeesToPaise(priceRupees));
  const mrpValid = mrpRupees.length === 0 || !Number.isNaN(rupeesToPaise(mrpRupees));
  const canSubmit = title.trim().length >= 2 && slug.length >= 2 && priceValid && mrpValid && !pending;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setSaved(null);
    startTransition(async () => {
      try {
        const basePrice = rupeesToPaise(priceRupees);
        const mrp = mrpRupees.length > 0 ? rupeesToPaise(mrpRupees) : null;
        const updated = await updateProduct(product.id, {
          title: title.trim(),
          slug,
          description: description.trim() || null,
          fabric: fabric.trim() || null,
          washCare: washCare.trim() || null,
          basePrice,
          mrp,
          categoryId: categoryId || null,
          status,
        });
        onSaved({
          title: updated.title,
          slug: updated.slug,
          basePrice: updated.basePrice,
          mrp: updated.mrp,
          categoryId: updated.categoryId,
          status: updated.status as ProductStatus,
        });
        setSaved("Basics saved.");
      } catch (err) {
        setError(actionErrorMessage(err, "Couldn't save product."));
      }
    });
  }

  return (
    <FormShell onSubmit={handleSubmit}>
      <FormSection title="Basics">
        <Field label="Title" required wide>
          <TextInput
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
        <Field label="Url slug" required wide hint={`/product/${slug}`}>
          <TextInput
            value={slug}
            onChange={(e) => setSlug(slugify(e.target.value))}
          />
        </Field>
        <Field label="Style code" wide hint="Auto-generated · used to build tag SKUs">
          <TextInput value={product.styleCode ?? "—"} disabled readOnly className="font-mono" />
        </Field>
        <Field label="Category" wide>
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">— uncategorised —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Description" wide>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
      </FormSection>

      <FormSection title="Pricing">
        <Field label="Selling price (₹)" required>
          <TextInput inputMode="decimal" value={priceRupees}
            onChange={(e) => setPriceRupees(e.target.value)} />
        </Field>
        <Field label="MRP (₹)" hint="Blank = same as selling price">
          <TextInput inputMode="decimal" value={mrpRupees}
            onChange={(e) => setMrpRupees(e.target.value)} />
        </Field>
      </FormSection>

      <FormSection title="Care & compliance">
        <Field label="Fabric composition" wide>
          <TextInput value={fabric} onChange={(e) => setFabric(e.target.value)} />
        </Field>
        <Field label="Wash care" wide>
          <TextInput value={washCare} onChange={(e) => setWashCare(e.target.value)} />
        </Field>
      </FormSection>

      <FormSection title="Visibility">
        <Field label="Status" wide>
          <Select value={status} onChange={(e) => setStatus(e.target.value as ProductStatus)}>
            <option value="draft">Draft — hidden</option>
            <option value="active">Active — live</option>
            <option value="archived">Archived — hidden, kept</option>
          </Select>
        </Field>
      </FormSection>

      {saved ? (
        <p className="text-xs text-cocoa">{saved}</p>
      ) : null}
      <SubmitBar
        cancelHref="/studio/products"
        pending={pending}
        label="Save changes"
        error={error}
        disabled={!canSubmit}
      />
    </FormShell>
  );
}

// ── Variants section ─────────────────────────────────────────────────────────
//
// Sizes are independent — clicking one only ever adds/removes that one size.
// Each size owns its own list of tags (colors); adding, editing, or removing a
// tag under one size never touches any other size's tags. A size only becomes
// a real DB row once it has at least one tag (a variant needs a sku+price).

const PRESET_SIZES = ["XS", "S", "M", "L", "XL"];

function VariantsSection({
  productId,
  styleCode,
  variants,
  onChange,
}: {
  productId: string;
  styleCode: string | null;
  variants: Variant[];
  onChange: (v: Variant[]) => void;
}) {
  // Sizes explicitly opened by the admin that have no tags (variants) yet —
  // these exist only in local UI state until the first tag is added.
  const [draftSizes, setDraftSizes] = useState<string[]>([]);
  const [customSize, setCustomSize] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const sizeGroups = useMemo(() => {
    const map = new Map<string, Variant[]>();
    for (const v of variants) {
      const key = v.size || "(no size)";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(v);
    }
    return map;
  }, [variants]);

  const activeSizes = useMemo(() => {
    const fromVariants = [...sizeGroups.keys()];
    return [...new Set([...fromVariants, ...draftSizes])];
  }, [sizeGroups, draftSizes]);

  function addSize(size: string) {
    if (!size || activeSizes.includes(size)) return;
    setDraftSizes((s) => [...s, size]);
  }

  function removeSize(size: string) {
    const existing = sizeGroups.get(size) ?? [];
    if (existing.length === 0) {
      setDraftSizes((s) => s.filter((x) => x !== size));
      return;
    }
    if (
      !confirm(
        `Remove size "${size}"? This deletes all ${existing.length} tag(s) under it.`,
      )
    ) {
      return;
    }
    setError(null);
    setRemoving(size);
    startTransition(async () => {
      try {
        await Promise.all(existing.map((v) => deleteVariant(v.id)));
        const ids = new Set(existing.map((v) => v.id));
        onChange(variants.filter((v) => !ids.has(v.id)));
        setDraftSizes((s) => s.filter((x) => x !== size));
      } catch (err) {
        setError(actionErrorMessage(err, "Couldn't remove size."));
      } finally {
        setRemoving(null);
      }
    });
  }

  function handleAddCustomSize(e: React.FormEvent) {
    e.preventDefault();
    const s = customSize.trim();
    if (!s) return;
    addSize(s);
    setCustomSize("");
  }

  return (
    <section className="rounded-2xl border border-cocoa/12 bg-cream p-5 shadow-[0_10px_28px_rgba(43,38,35,0.04)] md:p-6">
      <div className="border-b border-cocoa/10 pb-4">
        <h2 className="font-display text-xl uppercase text-maroon">sizes &amp; tags</h2>
        <p className="mt-1 text-xs text-charcoal/55">
          Click a size to add it on its own — nothing else gets added automatically.
          Each size manages its own tags independently.
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {PRESET_SIZES.map((s) => {
          const active = activeSizes.includes(s);
          return (
            <button
              key={s}
              type="button"
              onClick={() => (active ? removeSize(s) : addSize(s))}
              disabled={removing === s}
              aria-pressed={active}
              className={`rounded-full border px-4 py-2 text-sm uppercase tracking-wide transition duration-300 disabled:opacity-50 ${
                active
                  ? "border-maroon bg-maroon text-cream"
                  : "border-cocoa/25 bg-cream text-charcoal/70 hover:border-cocoa"
              }`}
            >
              {s}
            </button>
          );
        })}
      </div>

      <form onSubmit={handleAddCustomSize} className="mt-3 flex gap-2">
        <input
          value={customSize}
          onChange={(e) => setCustomSize(e.target.value)}
          placeholder="custom size (e.g. Free Size, 34)"
          aria-label="Custom size"
          className={`${variantInputClass} max-w-xs`}
        />
        <button
          type="submit"
          disabled={!customSize.trim()}
          className="inline-flex items-center gap-2 rounded-full border border-cocoa/22 bg-cream px-4 py-2 text-[11px] font-medium uppercase tracking-[0.18em] text-cocoa transition duration-500 hover:border-cocoa disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          add size
        </button>
      </form>
      {error ? <p className="mt-2 text-xs text-burnt-red">{error}</p> : null}

      {activeSizes.length === 0 ? (
        <p className="mt-6 text-sm text-charcoal/55">
          No sizes added yet. Click a size above, then add tags under it so
          customers can buy this product.
        </p>
      ) : (
        <div className="mt-6 space-y-5">
          {activeSizes.map((size) => (
            <SizeGroup
              key={size}
              productId={productId}
              styleCode={styleCode}
              size={size}
              tags={sizeGroups.get(size) ?? []}
              onRemoveSize={() => removeSize(size)}
              onTagAdded={(v) => onChange([...variants, v])}
              onTagUpdated={(v) =>
                onChange(variants.map((x) => (x.id === v.id ? v : x)))
              }
              onTagDeleted={(id) => onChange(variants.filter((v) => v.id !== id))}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * Client-side preview only — mirrors the server's colorCodeFrom/sizeCodeFrom
 * in lib/actions/admin/products.ts. The server always regenerates and is the
 * source of truth (handles collisions), this just shows the admin what to
 * expect before they hit "add tag".
 */
function previewSku(styleCode: string | null, color: string, size: string): string {
  const colorCode = color.replace(/[^a-zA-Z]/g, "").toUpperCase().slice(0, 3) || "STD";
  const sizeCode = size.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 4) || "OS";
  return `${styleCode ?? "…"}-${colorCode}-${sizeCode}`;
}

// text-base (not text-sm) below sm: — iOS Safari auto-zooms the whole page
// when a focused input/select/textarea computes to under 16px font-size.
const variantInputClass =
  "w-full rounded-lg border border-cocoa/20 bg-cream px-3 py-2 text-base text-charcoal outline-none transition duration-300 focus:border-cocoa disabled:opacity-60 sm:text-sm";

function SizeGroup({
  productId,
  styleCode,
  size,
  tags,
  onRemoveSize,
  onTagAdded,
  onTagUpdated,
  onTagDeleted,
}: {
  productId: string;
  styleCode: string | null;
  size: string;
  tags: Variant[];
  onRemoveSize: () => void;
  onTagAdded: (v: Variant) => void;
  onTagUpdated: (v: Variant) => void;
  onTagDeleted: (id: string) => void;
}) {
  const [adding, setAdding] = useState(false);

  function handleAdded(v: Variant) {
    onTagAdded(v);
    setAdding(false);
  }

  return (
    <div className="rounded-xl border border-cocoa/15 bg-cream/50 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-cocoa">
          size {size}
        </h3>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setAdding((s) => !s)}
            aria-expanded={adding}
            className="inline-flex items-center gap-1.5 rounded-full bg-cocoa px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.16em] text-cream transition duration-500 hover:bg-cocoa/90"
          >
            <Plus className="h-3 w-3" aria-hidden="true" />
            {adding ? "close" : "add tag"}
          </button>
          <button
            type="button"
            onClick={onRemoveSize}
            className="rounded-full border border-burnt-red/25 bg-cream p-1.5 text-burnt-red transition duration-500 hover:bg-burnt-red/10"
            aria-label={`remove size ${size}`}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {adding ? (
        <AddTagRow
          productId={productId}
          styleCode={styleCode}
          size={size}
          onAdded={handleAdded}
          onCancel={() => setAdding(false)}
        />
      ) : null}

      {tags.length === 0 ? (
        <p className="mt-3 text-xs text-charcoal/50">
          No tags yet for this size. Add one so it&rsquo;s purchasable.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-cocoa/10">
          {tags.map((v) => (
            <TagRow
              key={v.id}
              variant={v}
              onUpdated={onTagUpdated}
              onDeleted={onTagDeleted}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function AddTagRow({
  productId,
  styleCode,
  size,
  onAdded,
  onCancel,
}: {
  productId: string;
  styleCode: string | null;
  size: string;
  onAdded: (v: Variant) => void;
  onCancel: () => void;
}) {
  const [color, setColor] = useState("");
  const [sku, setSku] = useState("");
  const [skuEdited, setSkuEdited] = useState(false);
  const [priceRupees, setPriceRupees] = useState("");
  const [stock, setStock] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Legacy products (created before the style-code feature) have
  // styleCode: null until their first new tag is added — the server lazily
  // backfills it on submit. Showing "…-MRN-M" there would look like a real
  // partial SKU when it isn't; show nothing (with an explanatory
  // placeholder) instead until a style code actually exists.
  const effectiveSku = skuEdited
    ? sku
    : styleCode
      ? previewSku(styleCode, color, size)
      : "";
  const priceValid = priceRupees.length > 0 && !Number.isNaN(rupeesToPaise(priceRupees));
  const canSubmit = priceValid && !pending;

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    startTransition(async () => {
      try {
        const created = await createVariant(productId, {
          size,
          color: color.trim() || undefined,
          sku: skuEdited ? sku.trim() : undefined,
          price: rupeesToPaise(priceRupees),
          stock: Number.parseInt(stock, 10) || 0,
        });
        onAdded({
          id: created.id,
          size: created.size ?? "",
          color: created.color ?? "",
          sku: created.sku,
          price: created.price,
          stock: created.stock,
          weightGrams: created.weightGrams ?? null,
          isActive: created.isActive,
        });
      } catch (err) {
        setError(actionErrorMessage(err, "Couldn't add tag."));
      }
    });
  }

  return (
    <form
      onSubmit={handleAdd}
      className="mt-3 rounded-xl border border-cocoa/15 bg-cream/80 p-4"
      noValidate
    >
      <div className="grid gap-3 sm:grid-cols-[1.4fr_1.4fr_1fr_1fr]">
        <label className="block">
          <span className="block text-[10px] font-medium uppercase tracking-[0.14em] text-charcoal/45">
            tag / color
          </span>
          <input
            placeholder="e.g. maroon (optional)"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            aria-label="Tag / color"
            className={`mt-1 ${variantInputClass}`}
          />
        </label>
        <label className="block">
          <span className="block text-[10px] font-medium uppercase tracking-[0.14em] text-charcoal/45">
            sku
          </span>
          <input
            placeholder={styleCode ? "auto" : "assigned on save"}
            value={effectiveSku}
            onChange={(e) => { setSku(e.target.value); setSkuEdited(true); }}
            aria-label="SKU"
            className={`mt-1 ${variantInputClass} font-mono`}
          />
        </label>
        <label className="block">
          <span className="block text-[10px] font-medium uppercase tracking-[0.14em] text-charcoal/45">
            price (₹) <span className="text-burnt-red">*</span>
          </span>
          <input
            inputMode="decimal"
            placeholder="0.00"
            value={priceRupees}
            onChange={(e) => setPriceRupees(e.target.value)}
            aria-label="Price"
            className={`mt-1 ${variantInputClass}`}
          />
        </label>
        <label className="block">
          <span className="block text-[10px] font-medium uppercase tracking-[0.14em] text-charcoal/45">
            stock
          </span>
          <input
            inputMode="numeric"
            placeholder="0"
            value={stock}
            onChange={(e) => setStock(e.target.value.replace(/\D/g, ""))}
            aria-label="Stock"
            className={`mt-1 ${variantInputClass}`}
          />
        </label>
      </div>
      <p className="mt-1.5 text-[11px] text-charcoal/45">
        SKU auto-fills from the style code, tag, and size — edit it to override.
      </p>
      {error ? <p className="mt-2 text-xs text-burnt-red">{error}</p> : null}
      <div className="mt-3 flex items-center justify-end gap-2">
        <button type="button" onClick={onCancel}
          className="inline-flex items-center rounded-full border border-cocoa/22 bg-cream px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-cocoa transition duration-500 hover:border-cocoa">
          cancel
        </button>
        <button type="submit" disabled={!canSubmit}
          className="inline-flex items-center rounded-full bg-cocoa px-4 py-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-cream transition duration-500 hover:bg-cocoa/90 disabled:opacity-50">
          {pending ? "adding…" : "add tag"}
        </button>
      </div>
    </form>
  );
}

function TagRow({
  variant: initial,
  onUpdated,
  onDeleted,
}: {
  variant: Variant;
  onUpdated: (v: Variant) => void;
  onDeleted: (id: string) => void;
}) {
  const [v, setV] = useState(initial);
  const [priceRupees, setPriceRupees] = useState(paiseToRupees(initial.price));
  const [stockStr, setStockStr] = useState(String(initial.stock));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const dirty = useMemo(() => {
    return (
      v.color !== initial.color ||
      v.sku !== initial.sku ||
      priceRupees !== paiseToRupees(initial.price) ||
      stockStr !== String(initial.stock) ||
      v.isActive !== initial.isActive
    );
  }, [v, priceRupees, stockStr, initial]);

  function handleSave() {
    if (!dirty || pending) return;
    setError(null);
    const price = rupeesToPaise(priceRupees);
    const stock = Number.parseInt(stockStr, 10);
    if (Number.isNaN(price) || Number.isNaN(stock)) {
      setError("Check price and stock");
      return;
    }
    startTransition(async () => {
      try {
        const updated = await updateVariant(v.id, {
          color: v.color || null,
          sku: v.sku,
          price,
          stock,
          isActive: v.isActive,
        });
        const next: Variant = {
          id: updated.id,
          size: updated.size ?? "",
          color: updated.color ?? "",
          sku: updated.sku,
          price: updated.price,
          stock: updated.stock,
          weightGrams: updated.weightGrams ?? null,
          isActive: updated.isActive,
        };
        setV(next);
        setPriceRupees(paiseToRupees(next.price));
        setStockStr(String(next.stock));
        onUpdated(next);
      } catch (err) {
        setError(actionErrorMessage(err, "Couldn't save"));
      }
    });
  }

  function handleDelete() {
    if (!confirm(`Delete tag ${v.sku}? This cannot be undone.`)) return;
    startTransition(async () => {
      try {
        await deleteVariant(v.id);
        onDeleted(v.id);
      } catch (err) {
        setError(actionErrorMessage(err, "Couldn't delete"));
      }
    });
  }

  return (
    <li className="py-3">
      <div className="grid items-center gap-3 sm:grid-cols-[1.4fr_1.4fr_1fr_1fr_auto]">
        <input value={v.color} onChange={(e) => setV({ ...v, color: e.target.value })}
          placeholder="tag (e.g. color)" aria-label="Tag / color" className={variantInputClass} />
        <input value={v.sku} onChange={(e) => setV({ ...v, sku: e.target.value })}
          placeholder="SKU" aria-label="SKU" className={`${variantInputClass} font-mono`} />
        <input inputMode="decimal" value={priceRupees}
          onChange={(e) => setPriceRupees(e.target.value)}
          placeholder="price" aria-label="Price" className={variantInputClass} />
        <input inputMode="numeric" value={stockStr}
          onChange={(e) => setStockStr(e.target.value.replace(/\D/g, ""))}
          placeholder="stock" aria-label="Stock" className={variantInputClass} />
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={handleSave} disabled={!dirty || pending}
            className="rounded-full bg-cocoa px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.16em] text-cream transition duration-500 hover:bg-cocoa/90 disabled:opacity-40">
            {pending ? "…" : "save"}
          </button>
          <button type="button" onClick={handleDelete} disabled={pending}
            className="rounded-full border border-burnt-red/25 bg-cream p-1.5 text-burnt-red transition duration-500 hover:bg-burnt-red/10"
            aria-label={`delete tag ${v.sku}`}>
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
      <label className="mt-2 inline-flex cursor-pointer items-center gap-2 text-xs text-charcoal/60">
        <input type="checkbox" checked={v.isActive}
          onChange={(e) => setV({ ...v, isActive: e.target.checked })}
          className="h-3.5 w-3.5 accent-cocoa" />
        Active
      </label>
      {error ? <p className="mt-1 text-xs text-burnt-red">{error}</p> : null}
    </li>
  );
}

// ── Images section ───────────────────────────────────────────────────────────

function ImagesSection({
  productId,
  images,
  onChange,
}: {
  productId: string;
  images: Img[];
  onChange: (imgs: Img[]) => void;
}) {
  const [alt, setAlt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // The picker is always shown empty (`value={null}`) — this is an
  // "add another" flow, not an edit-one-slot flow, so it never reflects an
  // already-saved image back into itself. Each successful pick persists
  // immediately via addProductImage and the picker resets for the next one.
  function handlePicked(url: string | null) {
    if (!url || pending) return;
    setError(null);
    startTransition(async () => {
      try {
        const created = await addProductImage(productId, {
          url,
          altText: alt.trim() || undefined,
          sortOrder: images.length,
        });
        onChange([
          ...images,
          {
            id: created.id,
            url: created.url,
            altText: created.altText ?? "",
            sortOrder: created.sortOrder,
          },
        ]);
        setAlt("");
      } catch (err) {
        setError(actionErrorMessage(err, "Couldn't add image"));
      }
    });
  }

  function handleRemove(id: string) {
    if (!confirm("Remove this image?")) return;
    startTransition(async () => {
      try {
        await removeProductImage(id);
        onChange(images.filter((img) => img.id !== id));
      } catch (err) {
        setError(actionErrorMessage(err, "Couldn't remove image"));
      }
    });
  }

  return (
    <section className="rounded-2xl border border-cocoa/12 bg-cream p-5 shadow-[0_10px_28px_rgba(43,38,35,0.04)] md:p-6">
      <h2 className="border-b border-cocoa/10 pb-4 font-display text-xl uppercase text-maroon">
        images
      </h2>

      <div className="mt-4 grid gap-4 sm:grid-cols-[auto_1fr] sm:items-start">
        <CloudinaryImagePicker
          value={null}
          onChange={handlePicked}
          uploadImage={(file) => uploadAdminImage(file, "aarna/products")}
          folder="aarna/products"
          aspect="4/5"
          label="Add an image"
          hint="Upload a photo — add as many as you need, one at a time."
        />
        <label className="block">
          <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-charcoal/55">
            alt text
          </span>
          <input
            value={alt}
            onChange={(e) => setAlt(e.target.value)}
            placeholder="optional — describes the image for accessibility/SEO"
            className={`mt-3 ${variantInputClass}`}
          />
          <p className="mt-2 text-xs text-charcoal/55">
            Applies to the next image you add.
          </p>
        </label>
      </div>
      {pending ? <p className="mt-2 text-xs text-charcoal/55">Saving…</p> : null}
      {error ? <p className="mt-1 text-xs text-burnt-red">{error}</p> : null}

      {images.length === 0 ? (
        <p className="mt-5 text-sm text-charcoal/55">No images yet.</p>
      ) : (
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {images.map((img) => (
            <div key={img.id} className="group relative overflow-hidden rounded-xl border border-cocoa/12 bg-cream">
              <div className="relative aspect-square">
                <Image src={optimizedImageUrl(img.url)} alt={img.altText || "product image"} fill sizes="200px" className="object-cover" />
              </div>
              <button type="button" onClick={() => handleRemove(img.id)} disabled={pending}
                aria-label="Remove image"
                className="absolute right-1.5 top-1.5 inline-flex h-7 w-7 items-center justify-center rounded-full bg-cream/90 text-burnt-red opacity-0 shadow transition duration-300 focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-cream">
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ── Print tags ───────────────────────────────────────────────────────────────
//
// Checkbox + quantity per tag, instead of a single "print everything, one
// each" link — lets the admin print exactly the sizes/colors (and however
// many copies) they actually need right now, e.g. just the 3 tags for a
// newly-restocked color.

function PrintTagsCard({
  variants,
}: {
  variants: Variant[];
}) {
  const sorted = useMemo(
    () =>
      [...variants].sort((a, b) =>
        (a.size + a.color).localeCompare(b.size + b.color),
      ),
    [variants],
  );

  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [qty, setQty] = useState<Record<string, string>>({});
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function qtyFor(v: Variant) {
    return qty[v.id] ?? String(Math.max(1, v.stock));
  }

  function toggle(id: string) {
    setSelected((s) => ({ ...s, [id]: !s[id] }));
  }

  function selectAll() {
    setSelected(Object.fromEntries(sorted.map((v) => [v.id, true])));
  }

  function selectNone() {
    setSelected({});
  }

  async function handlePrint() {
    const items = sorted
      .filter((v) => selected[v.id])
      .map((v) => ({
        variantId: v.id,
        quantity: Math.max(1, Number.parseInt(qtyFor(v), 10) || 1),
      }));
    if (items.length === 0) {
      setError("Select at least one tag");
      return;
    }
    setError(null);
    setPrinting(true);
    try {
      const res = await fetch("/api/admin/hang-tags/print", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Couldn't generate tags");
      }
      const blob = await res.blob();
      window.open(URL.createObjectURL(blob), "_blank");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't generate tags");
    } finally {
      setPrinting(false);
    }
  }

  const selectedCount = Object.values(selected).filter(Boolean).length;

  return (
    <section className="rounded-2xl border border-cocoa/12 bg-cream p-5 shadow-[0_10px_28px_rgba(43,38,35,0.04)] md:p-6">
      <h2 className="border-b border-cocoa/10 pb-4 font-display text-xl uppercase text-maroon">
        hang tags
      </h2>
      <p className="mt-3 text-sm text-charcoal/60">
        Pick which tags to print and how many copies of each — size, MRP,
        fabric, care, HSN 6211, and a Code 128 barcode from the SKU. Quantity
        defaults to current stock. Feed the PDF into your label printer with
        the small-label roll.
      </p>

      {sorted.length === 0 ? (
        <p className="mt-4 text-sm text-charcoal/55">
          No tags yet — add a size and a tag above first.
        </p>
      ) : (
        <>
          <div className="mt-4 flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.16em] text-cocoa">
            <button type="button" onClick={selectAll} className="soft-link">
              select all
            </button>
            <span className="text-cocoa/30">·</span>
            <button type="button" onClick={selectNone} className="soft-link">
              select none
            </button>
          </div>

          <ul className="mt-3 divide-y divide-cocoa/10">
            {sorted.map((v) => (
              <li key={v.id} className="flex items-center gap-3 py-2.5">
                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    checked={Boolean(selected[v.id])}
                    onChange={() => toggle(v.id)}
                    className="h-4 w-4 shrink-0 accent-cocoa"
                    aria-label={`select tag ${v.sku}`}
                  />
                  <div className="min-w-0 flex-1 text-sm">
                    <span className="text-charcoal">
                      {[v.size, v.color].filter(Boolean).join(" / ") || "—"}
                    </span>
                    <span className="ml-2 font-mono text-xs text-charcoal/50">
                      {v.sku}
                    </span>
                  </div>
                </label>
                <label className="flex items-center gap-1.5 text-xs text-charcoal/60">
                  copies
                  <input
                    inputMode="numeric"
                    value={qtyFor(v)}
                    onChange={(e) =>
                      setQty((q) => ({
                        ...q,
                        [v.id]: e.target.value.replace(/\D/g, ""),
                      }))
                    }
                    className="w-14 rounded-lg border border-cocoa/20 bg-cream px-2 py-1 text-center text-sm text-charcoal outline-none focus:border-cocoa"
                  />
                </label>
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={handlePrint}
            disabled={printing || selectedCount === 0}
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-cocoa px-5 py-2.5 text-[11px] font-medium uppercase tracking-[0.18em] text-cream shadow-[0_10px_28px_rgba(140,106,90,0.22)] transition duration-500 hover:bg-cocoa/90 disabled:opacity-50"
          >
            <Printer className="h-3.5 w-3.5" aria-hidden="true" />
            {printing
              ? "generating…"
              : `print ${selectedCount || ""} selected`.trim()}
          </button>
          {error ? (
            <p className="mt-2 text-xs text-burnt-red">{error}</p>
          ) : null}
        </>
      )}
    </section>
  );
}
