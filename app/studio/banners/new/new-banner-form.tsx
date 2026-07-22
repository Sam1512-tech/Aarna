"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  CheckboxRow,
  Field,
  FormSection,
  FormShell,
  SubmitBar,
  Textarea,
  TextInput,
} from "@/components/admin/admin-form";
import { createBanner } from "@/lib/actions/admin/banners";
import { actionErrorMessage } from "@/lib/action-error";

function toDateOrNull(v: string): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function NewBannerForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [mobileImageUrl, setMobileImageUrl] = useState("");
  const [ctaLabel, setCtaLabel] = useState("");
  const [ctaHref, setCtaHref] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const imageValid = /^https?:\/\//.test(imageUrl);
  const canSubmit = imageValid && !pending;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    startTransition(async () => {
      try {
        await createBanner({
          title: title.trim() || undefined,
          subtitle: subtitle.trim() || undefined,
          imageUrl: imageUrl.trim(),
          mobileImageUrl: mobileImageUrl.trim() || undefined,
          ctaLabel: ctaLabel.trim() || undefined,
          ctaHref: ctaHref.trim() || undefined,
          sortOrder: Number.parseInt(sortOrder, 10) || 0,
          startsAt: toDateOrNull(startsAt),
          endsAt: toDateOrNull(endsAt),
          isActive,
        });
        router.push("/studio/banners");
        router.refresh();
      } catch (err) {
        setError(
          actionErrorMessage(err, "couldn't create banner."),
        );
      }
    });
  }

  return (
    <FormShell onSubmit={handleSubmit}>
      <FormSection
        title="Content"
        description="Title and subtitle overlay the image. Leave blank for image-only banners."
      >
        <Field label="Title" wide>
          <TextInput
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Slow essentials · summer 26"
          />
        </Field>
        <Field label="Subtitle" wide>
          <Textarea
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            placeholder="linen, cotton, quiet colours."
          />
        </Field>
      </FormSection>

      <FormSection
        title="Images"
        description="Paste Cloudinary URLs. Mobile image is optional — desktop image is used when blank."
      >
        <Field label="Desktop image url" required wide>
          <TextInput
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://res.cloudinary.com/…"
          />
        </Field>
        <Field label="Mobile image url" wide>
          <TextInput
            value={mobileImageUrl}
            onChange={(e) => setMobileImageUrl(e.target.value)}
            placeholder="https://res.cloudinary.com/…"
          />
        </Field>
      </FormSection>

      <FormSection
        title="Call to action"
        description="Optional button overlaid on the banner."
      >
        <Field label="Button label">
          <TextInput
            value={ctaLabel}
            onChange={(e) => setCtaLabel(e.target.value)}
            placeholder="shop the drop"
          />
        </Field>
        <Field label="Button link">
          <TextInput
            value={ctaHref}
            onChange={(e) => setCtaHref(e.target.value)}
            placeholder="/shop/dresses"
          />
        </Field>
      </FormSection>

      <FormSection
        title="Scheduling"
        description="Optional. Blank = active immediately, no end date."
      >
        <Field label="Starts at">
          <TextInput
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
          />
        </Field>
        <Field label="Ends at">
          <TextInput
            type="datetime-local"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
          />
        </Field>
        <Field label="Sort order" hint="Lower shows first.">
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
        cancelHref="/studio/banners"
        pending={pending}
        label="Create banner"
        error={error}
        disabled={!canSubmit}
      />
    </FormShell>
  );
}
