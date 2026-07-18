"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  Field,
  FormSection,
  FormShell,
  SubmitBar,
  TextInput,
  slugify,
} from "@/components/admin/admin-form";
import { CategoryImagePicker } from "@/components/admin/category-image-picker";
import { createCategory } from "@/lib/actions/admin/categories";
import { actionErrorMessage } from "@/lib/action-error";
import { uploadAdminImage } from "@/lib/cloudinary/upload-client";

export function NewCategoryForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [sortOrder, setSortOrder] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const suggestedSlug = useMemo(() => slugify(name), [name]);
  const effectiveSlug = slugEdited ? slug : suggestedSlug;

  const canSubmit = name.trim().length >= 2 && effectiveSlug.length >= 2 && !pending;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    startTransition(async () => {
      try {
        await createCategory({
          name: name.trim(),
          slug: effectiveSlug,
          sortOrder: sortOrder.trim() ? Number.parseInt(sortOrder, 10) : undefined,
          imageUrl,
        });
        router.push("/admin/categories");
        router.refresh();
      } catch (err) {
        setError(
          actionErrorMessage(err, "couldn't create category."),
        );
      }
    });
  }

  return (
    <FormShell onSubmit={handleSubmit}>
      <FormSection title="basics">
        <Field label="name" required wide>
          <TextInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Dresses"
            autoFocus
          />
        </Field>
        <Field
          label="url slug"
          required
          wide
          hint={`will appear as /shop/${effectiveSlug || "your-slug"}`}
        >
          <TextInput
            value={effectiveSlug}
            onChange={(e) => {
              setSlug(slugify(e.target.value));
              setSlugEdited(true);
            }}
            placeholder="dresses"
          />
        </Field>
        <Field
          label="sort order"
          hint="Lower shows first in the nav and homepage. Blank = last."
        >
          <TextInput
            inputMode="numeric"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value.replace(/[^\d]/g, ""))}
            placeholder="0"
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

      <SubmitBar
        cancelHref="/admin/categories"
        pending={pending}
        label="create category"
        error={error}
        disabled={!canSubmit}
      />
    </FormShell>
  );
}
