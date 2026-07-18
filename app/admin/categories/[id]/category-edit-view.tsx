"use client";

import { useState, useTransition } from "react";
import {
  Field,
  FormSection,
  FormShell,
  SubmitBar,
  TextInput,
  slugify,
} from "@/components/admin/admin-form";
import { CategoryImagePicker } from "@/components/admin/category-image-picker";
import { updateCategory } from "@/lib/actions/admin/categories";
import type { Category } from "@/lib/types";
import { actionErrorMessage } from "@/lib/action-error";
import { uploadAdminImage } from "@/lib/cloudinary/upload-client";

export function CategoryEditView({ category }: { category: Category }) {
  const [name, setName] = useState(category.name);
  const [slug, setSlug] = useState(category.slug);
  const [sortOrder, setSortOrder] = useState(String(category.sortOrder));
  const [imageUrl, setImageUrl] = useState<string | null>(category.imageUrl);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const canSubmit = name.trim().length >= 2 && slug.length >= 2 && !pending;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setSaved(null);
    startTransition(async () => {
      try {
        await updateCategory(category.id, {
          name: name.trim(),
          slug,
          sortOrder: sortOrder.trim() ? Number.parseInt(sortOrder, 10) : 0,
          imageUrl,
        });
        setSaved("Saved.");
      } catch (err) {
        setError(actionErrorMessage(err, "couldn't save category."));
      }
    });
  }

  return (
    <FormShell onSubmit={handleSubmit}>
      <FormSection title="basics">
        <Field label="name" required wide>
          <TextInput value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="url slug" required wide hint={`/shop/${slug || "your-slug"}`}>
          <TextInput
            value={slug}
            onChange={(e) => setSlug(slugify(e.target.value))}
          />
        </Field>
        <Field
          label="sort order"
          hint="Lower shows first in the nav and homepage."
        >
          <TextInput
            inputMode="numeric"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value.replace(/[^\d]/g, ""))}
          />
        </Field>
      </FormSection>

      <FormSection
        title="homepage tile"
        description="Shown on the homepage's wardrobe-paths grid. Portrait works best."
      >
        <CategoryImagePicker
          value={imageUrl}
          onChange={setImageUrl}
          uploadImage={(file) => uploadAdminImage(file, "aarna/categories")}
        />
      </FormSection>

      {saved ? <p className="text-xs text-cocoa">{saved}</p> : null}
      <SubmitBar
        cancelHref="/admin/categories"
        pending={pending}
        label="save changes"
        error={error}
        disabled={!canSubmit}
      />
    </FormShell>
  );
}
