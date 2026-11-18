"use client";

import { useState, useTransition } from "react";
import {
  CheckboxRow,
  Field,
  FormSection,
  FormShell,
  SubmitBar,
  TextInput,
  slugify,
} from "@/components/admin/admin-form";
import { CloudinaryImagePicker } from "@/components/admin/cloudinary-image-picker";
import { SizeChartEditor } from "@/components/admin/size-chart-editor";
import { updateCategory } from "@/lib/actions/admin/categories";
import {
  chartSignature,
  readSizeChart,
  sizeChartProblem,
  type SizeChart,
} from "@/lib/size-chart";
import type { CategoryWithSizeChart } from "@/lib/types";
import { actionErrorMessage } from "@/lib/action-error";
import { uploadAdminImage } from "@/lib/cloudinary/upload-client";

export function CategoryEditView({ category }: { category: CategoryWithSizeChart }) {
  const [name, setName] = useState(category.name);
  const [slug, setSlug] = useState(category.slug);
  const [sortOrder, setSortOrder] = useState(String(category.sortOrder));
  const [imageUrl, setImageUrl] = useState<string | null>(category.imageUrl);
  const [isActive, setIsActive] = useState(category.isActive);
  const [sizeChart, setSizeChart] = useState<SizeChart | null>(() =>
    readSizeChart(category.sizeChart),
  );
  // What's stored right now, so the chart is only sent when it changed.
  const [savedChartSig, setSavedChartSig] = useState(() =>
    chartSignature(readSizeChart(category.sizeChart)),
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const chartDirty = chartSignature(sizeChart) !== savedChartSig;
  const chartProblem = sizeChart ? sizeChartProblem(sizeChart) : null;

  const canSubmit =
    name.trim().length >= 2 && slug.length >= 2 && !pending && !chartProblem;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setSaved(null);
    startTransition(async () => {
      try {
        const updated = await updateCategory(category.id, {
          name: name.trim(),
          slug,
          sortOrder: sortOrder.trim() ? Number.parseInt(sortOrder, 10) : 0,
          imageUrl,
          isActive,
          ...(chartDirty ? { sizeChart } : {}),
        });
        // Show what the server actually stored (it trims every cell).
        const stored = readSizeChart(updated.sizeChart);
        setSizeChart(stored);
        setSavedChartSig(chartSignature(stored));
        setSaved("Saved.");
      } catch (err) {
        setError(actionErrorMessage(err, "Couldn't save category."));
      }
    });
  }

  return (
    <FormShell onSubmit={handleSubmit}>
      <FormSection title="Basics">
        <Field label="Name" required wide>
          <TextInput value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Url slug" required wide hint={`/shop/${slug || "your-slug"}`}>
          <TextInput
            value={slug}
            onChange={(e) => setSlug(slugify(e.target.value))}
          />
        </Field>
        <Field
          label="Sort order"
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
        title="Visibility"
        description="Inactive categories are hidden from the storefront. Products set to Active still show in the shop — keep them as Draft until you're ready."
      >
        <CheckboxRow
          label="Active — show on the storefront"
          checked={isActive}
          onChange={setIsActive}
        />
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

      <FormSection
        title="Size chart"
        description="Optional. Shown when a customer opens Size guide on a product in this category. Leave it off to use the default chart (bust, waist, hip)."
      >
        <SizeChartEditor
          value={sizeChart}
          onChange={setSizeChart}
          problem={chartProblem}
        />
      </FormSection>

      {saved ? <p className="text-xs text-cocoa">{saved}</p> : null}
      <SubmitBar
        cancelHref="/studio/categories"
        pending={pending}
        label="Save changes"
        error={error}
        disabled={!canSubmit}
      />
    </FormShell>
  );
}
