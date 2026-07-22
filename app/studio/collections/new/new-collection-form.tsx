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
import { createCollection } from "@/lib/actions/admin/collections";
import { actionErrorMessage } from "@/lib/action-error";

export function NewCollectionForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [description, setDescription] = useState("");
  const [heroImageUrl, setHeroImageUrl] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const suggestedSlug = useMemo(() => slugify(name), [name]);
  const effectiveSlug = slugEdited ? slug : suggestedSlug;

  const heroValid = heroImageUrl.length === 0 || /^https?:\/\//.test(heroImageUrl);
  const canSubmit =
    name.trim().length >= 2 && effectiveSlug.length >= 2 && heroValid && !pending;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    startTransition(async () => {
      try {
        const collection = await createCollection({
          name: name.trim(),
          slug: effectiveSlug,
          description: description.trim() || undefined,
          heroImageUrl: heroImageUrl.trim() || undefined,
          sortOrder: Number.parseInt(sortOrder, 10) || 0,
          isActive,
        });
        // Take them straight to the collections list — detail view lives there for now.
        router.push("/studio/collections");
        router.refresh();
        // Silence unused-var warning until edit view exists
        void collection;
      } catch (err) {
        setError(
          actionErrorMessage(err, "couldn't create collection."),
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
            placeholder="Slow essentials"
            autoFocus
          />
        </Field>
        <Field
          label="Url slug"
          required
          wide
          hint={`will appear as /collections/${effectiveSlug || "your-slug"}`}
        >
          <TextInput
            value={effectiveSlug}
            onChange={(e) => {
              setSlug(slugify(e.target.value));
              setSlugEdited(true);
            }}
            placeholder="slow-essentials"
          />
        </Field>
        <Field label="Description" wide>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="a few words for the collection page header."
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

      <SubmitBar
        cancelHref="/studio/collections"
        pending={pending}
        label="Create collection"
        error={error}
        disabled={!canSubmit}
      />
    </FormShell>
  );
}
