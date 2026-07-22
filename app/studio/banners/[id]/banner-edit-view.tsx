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
import { updateBanner, type Banner } from "@/lib/actions/admin/banners";
import { actionErrorMessage } from "@/lib/action-error";

function toDateOrNull(v: string): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toLocalInputValue(d: Date | string | null): string {
  if (!d) return "";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(
    dt.getHours(),
  )}:${pad(dt.getMinutes())}`;
}

export function BannerEditView({ banner }: { banner: Banner }) {
  const router = useRouter();
  const [title, setTitle] = useState(banner.title ?? "");
  const [subtitle, setSubtitle] = useState(banner.subtitle ?? "");
  const [imageUrl, setImageUrl] = useState(banner.imageUrl);
  const [mobileImageUrl, setMobileImageUrl] = useState(banner.mobileImageUrl ?? "");
  const [ctaLabel, setCtaLabel] = useState(banner.ctaLabel ?? "");
  const [ctaHref, setCtaHref] = useState(banner.ctaHref ?? "");
  const [sortOrder, setSortOrder] = useState(String(banner.sortOrder));
  const [startsAt, setStartsAt] = useState(toLocalInputValue(banner.startsAt));
  const [endsAt, setEndsAt] = useState(toLocalInputValue(banner.endsAt));
  const [isActive, setIsActive] = useState(banner.isActive);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const imageValid = /^https?:\/\//.test(imageUrl);
  const canSubmit = imageValid && !pending;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setSaved(null);
    startTransition(async () => {
      try {
        await updateBanner(banner.id, {
          title: title.trim() || null,
          subtitle: subtitle.trim() || null,
          imageUrl: imageUrl.trim(),
          mobileImageUrl: mobileImageUrl.trim() || null,
          ctaLabel: ctaLabel.trim() || null,
          ctaHref: ctaHref.trim() || null,
          sortOrder: Number.parseInt(sortOrder, 10) || 0,
          startsAt: toDateOrNull(startsAt),
          endsAt: toDateOrNull(endsAt),
          isActive,
        });
        setSaved("Saved.");
        router.refresh();
      } catch (err) {
        setError(actionErrorMessage(err, "couldn't save banner."));
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

      {saved ? <p className="text-xs text-cocoa">{saved}</p> : null}
      <SubmitBar
        cancelHref="/studio/banners"
        pending={pending}
        label="Save changes"
        error={error}
        disabled={!canSubmit}
      />
    </FormShell>
  );
}
