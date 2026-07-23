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
import { CloudinaryImagePicker } from "@/components/admin/cloudinary-image-picker";
import { createBanner } from "@/lib/actions/admin/banners";
import { actionErrorMessage } from "@/lib/action-error";
import { uploadAdminImage } from "@/lib/cloudinary/upload-client";

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
        description="Mobile image is optional — desktop image is used when blank."
      >
        <CloudinaryImagePicker
          value={imageUrl || null}
          onChange={(url) => setImageUrl(url ?? "")}
          uploadImage={(file) => uploadAdminImage(file, "aarna/banners")}
          folder="aarna/banners"
          aspect="12/5"
          label="Desktop image"
          hint="Shown as the full-width homepage hero. Wide/landscape works best."
        />
        <CloudinaryImagePicker
          value={mobileImageUrl || null}
          onChange={(url) => setMobileImageUrl(url ?? "")}
          uploadImage={(file) => uploadAdminImage(file, "aarna/banners")}
          folder="aarna/banners"
          aspect="4/5"
          label="Mobile image"
          hint="Optional — desktop image is used when blank."
        />
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
