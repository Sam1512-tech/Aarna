"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  CheckboxRow,
  Field,
  FormSection,
  FormShell,
  SubmitBar,
  Textarea,
  TextInput,
  slugify,
} from "@/components/admin/admin-form";
import { tableClasses } from "@/components/admin/admin-primitives";
import { ReorderButtons } from "@/components/admin/reorder-buttons";
import {
  addProductsToCollection,
  removeProductsFromCollection,
  reorderProductsInCollection,
  updateCollection,
} from "@/lib/actions/admin/collections";
import { actionErrorMessage } from "@/lib/action-error";
import { formatINR } from "@/lib/utils";

interface CollectionDraft {
  id: string;
  name: string;
  slug: string;
  description: string;
  heroImageUrl: string;
  sortOrder: number;
  isActive: boolean;
}

interface CollectionMember {
  productId: string;
  title: string;
  slug: string;
  basePrice: number;
  status: string;
  sortOrder: number;
  imageUrl: string | null;
}

interface PickableProduct {
  id: string;
  title: string;
  basePrice: number;
  status: string;
}

export function CollectionEditView({
  collection,
  members,
  allProducts,
}: {
  collection: CollectionDraft;
  members: CollectionMember[];
  allProducts: PickableProduct[];
}) {
  const [name, setName] = useState(collection.name);
  const [slug, setSlug] = useState(collection.slug);
  const [description, setDescription] = useState(collection.description);
  const [heroImageUrl, setHeroImageUrl] = useState(collection.heroImageUrl);
  const [sortOrder, setSortOrder] = useState(String(collection.sortOrder));
  const [isActive, setIsActive] = useState(collection.isActive);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const heroValid = heroImageUrl.length === 0 || /^https?:\/\//.test(heroImageUrl);
  const canSubmit = name.trim().length >= 2 && slug.length >= 2 && heroValid && !pending;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setSaved(null);
    startTransition(async () => {
      try {
        await updateCollection(collection.id, {
          name: name.trim(),
          slug,
          description: description.trim() || null,
          heroImageUrl: heroImageUrl.trim() || null,
          sortOrder: Number.parseInt(sortOrder, 10) || 0,
          isActive,
        });
        setSaved("Saved.");
      } catch (err) {
        setError(actionErrorMessage(err, "couldn't save collection."));
      }
    });
  }

  return (
    <>
      <FormShell onSubmit={handleSubmit}>
      <FormSection title="Basics">
        <Field label="Name" required wide>
          <TextInput value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field
          label="Url slug"
          required
          wide
          hint={`/collections/${slug || "your-slug"}`}
        >
          <TextInput
            value={slug}
            onChange={(e) => setSlug(slugify(e.target.value))}
          />
        </Field>
        <Field label="Description" wide>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
      </FormSection>

      <FormSection
        title="Hero image"
        description="Shown at the top of the collection page. Optional."
      >
        <Field label="Hero image url" wide>
          <TextInput
            value={heroImageUrl}
            onChange={(e) => setHeroImageUrl(e.target.value)}
            placeholder="https://res.cloudinary.com/…"
          />
        </Field>
      </FormSection>

      <FormSection title="Visibility">
        <Field label="Sort order" hint="Lower shows first on listing pages.">
          <TextInput
            inputMode="numeric"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value.replace(/[^\d-]/g, ""))}
          />
        </Field>
        <CheckboxRow
          label="Active — show on the storefront"
          checked={isActive}
          onChange={setIsActive}
        />
      </FormSection>

      {saved ? <p className="text-xs text-cocoa">{saved}</p> : null}
      <SubmitBar
        cancelHref="/studio/collections"
        pending={pending}
        label="Save changes"
        error={error}
        disabled={!canSubmit}
      />
      </FormShell>

      <ProductMembershipSection
        collectionId={collection.id}
        members={members}
        allProducts={allProducts}
      />
    </>
  );
}

function ProductMembershipSection({
  collectionId,
  members,
  allProducts,
}: {
  collectionId: string;
  members: CollectionMember[];
  allProducts: PickableProduct[];
}) {
  const router = useRouter();
  const t = tableClasses();
  const [selectedId, setSelectedId] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const memberIds = useMemo(
    () => new Set(members.map((m) => m.productId)),
    [members],
  );
  const pickable = useMemo(
    () => allProducts.filter((p) => !memberIds.has(p.id)),
    [allProducts, memberIds],
  );

  function handleAdd() {
    if (!selectedId) return;
    setError(null);
    setAdding(true);
    addProductsToCollection(collectionId, [selectedId])
      .then(() => {
        setSelectedId("");
        router.refresh();
      })
      .catch((err) => setError(actionErrorMessage(err, "couldn't add product")))
      .finally(() => setAdding(false));
  }

  function handleRemove(productId: string) {
    setError(null);
    removeProductsFromCollection(collectionId, [productId])
      .then(() => router.refresh())
      .catch((err) =>
        setError(actionErrorMessage(err, "couldn't remove product")),
      );
  }

  return (
    <div className="mt-10">
      <h2 className="font-display text-xl text-maroon">
        Products in this collection
      </h2>
      <p className="mt-1 text-sm text-charcoal/60">
        Add or remove products, and reorder how they appear on the collection
        page.
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="min-w-56 flex-1">
          <span className="block text-[11px] font-medium uppercase tracking-[0.16em] text-charcoal/55">
            add a product
          </span>
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="mt-1.5 block w-full rounded-xl border border-cocoa/20 bg-cream px-4 py-2.5 text-base text-charcoal outline-none transition duration-500 focus:border-cocoa sm:text-sm"
          >
            <option value="">
              {pickable.length === 0 ? "no more products to add" : "select a product…"}
            </option>
            {pickable.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title} · {formatINR(p.basePrice)}
                {p.status !== "active" ? ` (${p.status})` : ""}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={handleAdd}
          disabled={!selectedId || adding}
          className="rounded-full bg-cocoa px-5 py-2.5 text-[11px] font-medium uppercase tracking-[0.16em] text-cream transition duration-500 hover:bg-cocoa/90 disabled:opacity-50"
        >
          {adding ? "adding…" : "add"}
        </button>
      </div>
      {error ? <p className="mt-2 text-xs text-burnt-red">{error}</p> : null}

      <div className="mt-5">
        {members.length === 0 ? (
          <p className="rounded-2xl border border-cocoa/12 bg-cream/60 px-5 py-6 text-sm text-charcoal/55">
            No products yet — this collection will render empty on the
            storefront until you add some above.
          </p>
        ) : (
          <div className={t.wrapper}>
            <table className={t.table}>
              <thead className={t.thead}>
                <tr>
                  <th className={t.th}>product</th>
                  <th className={t.th}>price</th>
                  <th className={t.th}>status</th>
                  <th className={t.th}>order</th>
                  <th className={t.th}></th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.productId} className={t.tr}>
                    <td className={`${t.td} font-medium text-maroon`}>
                      {m.title}
                    </td>
                    <td className={t.td}>{formatINR(m.basePrice)}</td>
                    <td className={t.td}>{m.status}</td>
                    <td className={t.td}>
                      <ReorderButtons
                        items={members.map((mm) => ({
                          id: mm.productId,
                          sortOrder: mm.sortOrder,
                        }))}
                        id={m.productId}
                        action={(items) =>
                          reorderProductsInCollection(
                            collectionId,
                            items.map((i) => ({
                              productId: i.id,
                              sortOrder: i.sortOrder,
                            })),
                          )
                        }
                      />
                    </td>
                    <td className={t.td}>
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => handleRemove(m.productId)}
                          aria-label={`remove ${m.title}`}
                          title={`remove ${m.title}`}
                          className="flex h-10 w-10 items-center justify-center rounded-full border border-burnt-red/25 bg-cream text-burnt-red transition duration-500 hover:bg-burnt-red/10"
                        >
                          ✕
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
