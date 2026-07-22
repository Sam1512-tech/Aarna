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
} from "@/components/admin/admin-form";
import {
  upsertHomepageVideoSlot,
  type HomepageVideoPosition,
  type HomepageVideoSlot,
} from "@/lib/actions/admin/homepage-video-slots";
import { actionErrorMessage } from "@/lib/action-error";

export function HomepageVideosView({
  left,
  right,
}: {
  left: HomepageVideoSlot | null;
  right: HomepageVideoSlot | null;
}) {
  return (
    <div className="mt-6 grid gap-6 md:grid-cols-2">
      <VideoSlotForm position="left" label="left video" slot={left} />
      <VideoSlotForm position="right" label="right video" slot={right} />
    </div>
  );
}

function VideoSlotForm({
  position,
  label,
  slot,
}: {
  position: HomepageVideoPosition;
  label: string;
  slot: HomepageVideoSlot | null;
}) {
  const [videoUrl, setVideoUrl] = useState(slot?.videoUrl ?? "");
  const [title, setTitle] = useState(slot?.title ?? "");
  const [subtitle, setSubtitle] = useState(slot?.subtitle ?? "");
  const [ctaLabel, setCtaLabel] = useState(slot?.ctaLabel ?? "");
  const [ctaHref, setCtaHref] = useState(slot?.ctaHref ?? "");
  const [isActive, setIsActive] = useState(slot?.isActive ?? true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const videoValid = videoUrl.length === 0 || /^https?:\/\//.test(videoUrl);
  const canSubmit = videoValid && !pending;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setSaved(null);
    startTransition(async () => {
      try {
        await upsertHomepageVideoSlot(position, {
          videoUrl: videoUrl.trim(),
          title: title.trim(),
          subtitle: subtitle.trim(),
          ctaLabel: ctaLabel.trim(),
          ctaHref: ctaHref.trim(),
          isActive,
        });
        setSaved("Saved.");
      } catch (err) {
        setError(actionErrorMessage(err, "couldn't save video."));
      }
    });
  }

  return (
    <FormShell onSubmit={handleSubmit}>
      <FormSection
        title={label}
        description="Paste a Cloudinary video URL. Leave blank to show the placeholder instead."
      >
        <Field label="video url" wide hint="https://res.cloudinary.com/…/video/upload/…">
          <TextInput
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            placeholder="https://res.cloudinary.com/…"
          />
        </Field>
        <Field label="title" hint="Small eyebrow label overlaid on the video">
          <TextInput value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="subtitle" wide hint="Larger heading, shown under the title">
          <Textarea
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
          />
        </Field>
      </FormSection>

      <FormSection
        title="call to action"
        description="Optional button overlaid on the video."
      >
        <Field label="button label">
          <TextInput
            value={ctaLabel}
            onChange={(e) => setCtaLabel(e.target.value)}
            placeholder="shop the drop"
          />
        </Field>
        <Field label="button link">
          <TextInput
            value={ctaHref}
            onChange={(e) => setCtaHref(e.target.value)}
            placeholder="/shop/dresses"
          />
        </Field>
        <CheckboxRow
          label="active — show on the homepage"
          checked={isActive}
          onChange={setIsActive}
        />
      </FormSection>

      {saved ? <p className="text-xs text-cocoa">{saved}</p> : null}
      <SubmitBar
        cancelHref="/studio"
        pending={pending}
        label="save"
        error={error}
        disabled={!canSubmit}
      />
    </FormShell>
  );
}
