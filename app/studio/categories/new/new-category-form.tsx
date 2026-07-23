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
import { CloudinaryImagePicker } from "@/components/admin/cloudinary-image-picker";
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
        router.push("/studio/categories");
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
      <FormSection title="Basics">
        <Field label="Name" required wide>
          <TextInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Dresses"
            autoFocus
          />
        </Field>
        <Field
          label="Url slug"
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
          label="Sort order"
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
        title="Homepage tile"
        description="Shown on the homepage's wardrobe-paths grid. Portrait works best."
      >
        <CloudinaryImagePicker
          value={imageUrl}
          onChange={setImageUrl}
          uploadImage={(file) => uploadAdminImage(file, "aarna/categories")}
          folder="aarna/categories"
          aspect="4/5"
          label="Category image"
        />
      </FormSection>

      <SubmitBar
        cancelHref="/studio/categories"
        pending={pending}
        label="Create category"
        error={error}
        disabled={!canSubmit}
      />
    </FormShell>
  );
}
