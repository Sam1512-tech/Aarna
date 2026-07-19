"use client";

import { useState, useTransition } from "react";
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
import { updateCollection } from "@/lib/actions/admin/collections";
import { actionErrorMessage } from "@/lib/action-error";

interface CollectionDraft {
  id: string;
  name: string;
  slug: string;
  description: string;
  heroImageUrl: string;
  sortOrder: number;
  isActive: boolean;
}

export function CollectionEditView({
  collection,
}: {
  collection: CollectionDraft;
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
    <FormShell onSubmit={handleSubmit}>
      <FormSection title="basics">
        <Field label="name" required wide>
          <TextInput value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field
          label="url slug"
          required
          wide
          hint={`/collections/${slug || "your-slug"}`}
        >
          <TextInput
            value={slug}
            onChange={(e) => setSlug(slugify(e.target.value))}
          />
        </Field>
        <Field label="description" wide>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
      </FormSection>

      <FormSection
        title="hero image"
        description="Shown at the top of the collection page. Optional."
      >
        <Field label="hero image url" wide>
          <TextInput
            value={heroImageUrl}
            onChange={(e) => setHeroImageUrl(e.target.value)}
            placeholder="https://res.cloudinary.com/…"
          />
        </Field>
      </FormSection>

      <FormSection title="visibility">
        <Field label="sort order" hint="Lower shows first on listing pages.">
          <TextInput
            inputMode="numeric"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value.replace(/[^\d-]/g, ""))}
          />
        </Field>
        <CheckboxRow
          label="active — show on the storefront"
          checked={isActive}
          onChange={setIsActive}
        />
      </FormSection>

      {saved ? <p className="text-xs text-cocoa">{saved}</p> : null}
      <SubmitBar
        cancelHref="/admin/collections"
        pending={pending}
        label="save changes"
        error={error}
        disabled={!canSubmit}
      />
    </FormShell>
  );
}
