export const REJECT_REASONS = [
  { value: "window_expired", label: "Outside the 3-day window" },
  { value: "not_eligible", label: "Not eligible for return" },
  { value: "photos_insufficient", label: "Photos don't show the issue" },
  { value: "used_or_altered", label: "Piece appears worn or altered" },
  { value: "other", label: "Other (add a note)" },
] as const;

export type RejectReason = (typeof REJECT_REASONS)[number]["value"];
