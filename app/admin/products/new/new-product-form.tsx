"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  CheckboxRow,
  Field,
  FormSection,
  FormShell,
  Select,
  SubmitBar,
  Textarea,
  TextInput,
  slugify,
} from "@/components/admin/admin-form";
import { createProduct } from "@/lib/actions/admin/products";
import { actionErrorMessage } from "@/lib/action-error";

interface CategoryOption {
  id: string;
  name: string;
}

/**
 * MRP and selling price live in the UI as rupees for readability, but the
 * backend action expects paise. Convert on submit.
 */
function rupeesToPaise(v: string) {
  const num = Number.parseFloat(v);
  if (!Number.isFinite(num) || num < 0) return NaN;
  return Math.round(num * 100);
}

export function NewProductForm({ categories }: { categories: CategoryOption[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [description, setDescription] = useState("");
  const [fabric, setFabric] = useState("");
  const [washCare, setWashCare] = useState("");
  const [priceRupees, setPriceRupees] = useState("");
  const [mrpRupees, setMrpRupees] = useState("");
  const [categoryId, setCategoryId] = useState<string>(categories[0]?.id ?? "");
  const [publishNow, setPublishNow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Auto-suggest slug from title until the user edits the slug field manually.
  const suggestedSlug = useMemo(() => slugify(title), [title]);
  const effectiveSlug = slugEdited ? slug : suggestedSlug;

  const priceValid = priceRupees.length > 0 && !Number.isNaN(rupeesToPaise(priceRupees));
  const mrpValid = mrpRupees.length === 0 || !Number.isNaN(rupeesToPaise(mrpRupees));
  const canSubmit =
    title.trim().length >= 2 &&
    effectiveSlug.length >= 2 &&
    priceValid &&
    mrpValid &&
    !pending;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    startTransition(async () => {
      try {
        const basePrice = rupeesToPaise(priceRupees);
        const mrp = mrpRupees.length > 0 ? rupeesToPaise(mrpRupees) : undefined;
        const product = await createProduct({
          title: title.trim(),
          slug: effectiveSlug,
          description: description.trim() || undefined,
          fabric: fabric.trim() || undefined,
          washCare: washCare.trim() || undefined,
          basePrice,
          mrp,
          categoryId: categoryId || undefined,
          status: publishNow ? "active" : "draft",
        });
        router.push(`/admin/products/${product.id}`);
        router.refresh();
      } catch (err) {
        setError(
          actionErrorMessage(err, "couldn't create product."),
        );
      }
    });
  }

  return (
    <FormShell onSubmit={handleSubmit}>
      <FormSection
        title="basics"
        description="These are the fields customers and search engines see first."
      >
        <Field label="title" required wide>
          <TextInput
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Linen slip dress"
            autoFocus
          />
        </Field>
        <Field
          label="url slug"
          required
          wide
          hint={`will appear as /product/${effectiveSlug || "your-slug"}`}
        >
          <TextInput
            value={effectiveSlug}
            onChange={(e) => {
              setSlug(slugify(e.target.value));
              setSlugEdited(true);
            }}
            placeholder="linen-slip-dress"
          />
        </Field>
        <Field label="category" wide>
          <Select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="">— uncategorised —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="description" wide>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="a short story about the piece — silhouette, drape, mood."
          />
        </Field>
      </FormSection>

      <FormSection
        title="pricing"
        description="Enter amounts in rupees. Both selling price and MRP show on the hang tag."
      >
        <Field label="selling price (₹)" required>
          <TextInput
            inputMode="decimal"
            value={priceRupees}
            onChange={(e) => setPriceRupees(e.target.value)}
            placeholder="2499"
          />
        </Field>
        <Field
          label="mrp (₹)"
          hint="Required by legal metrology if selling at a discount. Leave blank if same as selling price."
        >
          <TextInput
            inputMode="decimal"
            value={mrpRupees}
            onChange={(e) => setMrpRupees(e.target.value)}
            placeholder="2999"
          />
        </Field>
      </FormSection>

      <FormSection
        title="care & compliance"
        description="Fabric and care instructions are legally required on garment labels."
      >
        <Field label="fabric composition" wide>
          <TextInput
            value={fabric}
            onChange={(e) => setFabric(e.target.value)}
            placeholder="100% linen"
          />
        </Field>
        <Field label="wash care" wide>
          <TextInput
            value={washCare}
            onChange={(e) => setWashCare(e.target.value)}
            placeholder="dry clean only"
          />
        </Field>
      </FormSection>

      <FormSection
        title="visibility"
        description="Draft products stay hidden. Publish once variants and photos are added."
      >
        <CheckboxRow
          label="publish now (skip draft state)"
          checked={publishNow}
          onChange={setPublishNow}
        />
      </FormSection>

      <SubmitBar
        cancelHref="/admin/products"
        pending={pending}
        label="create product"
        error={error}
        disabled={!canSubmit}
      />
    </FormShell>
  );
}
