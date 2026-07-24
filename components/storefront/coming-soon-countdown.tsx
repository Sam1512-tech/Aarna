"use client";

import { useEffect, useState } from "react";

interface Remaining {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

function remainingUntil(target: number): Remaining {
  const diff = Math.max(0, target - Date.now());
  const totalSeconds = Math.floor(diff / 1000);
  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}

const UNITS: { key: keyof Remaining; label: string }[] = [
  { key: "days", label: "Days" },
  { key: "hours", label: "Hours" },
  { key: "minutes", label: "Minutes" },
  { key: "seconds", label: "Seconds" },
];

export function ComingSoonCountdown({ targetIso }: { targetIso: string }) {
  const target = new Date(targetIso).getTime();
  // Server-rendered markup can't know the visitor's clock, so the first paint
  // starts at all-zeros and fills in on mount — avoids a hydration mismatch
  // between server time and client time.
  const [remaining, setRemaining] = useState<Remaining | null>(null);

  useEffect(() => {
    // No synchronous priming call here on purpose — the first tick (up to 1s
    // later) fills in the real value. Keeps this a pure subscription effect
    // instead of an immediate setState-in-effect.
    const id = setInterval(() => setRemaining(remainingUntil(target)), 1000);
    return () => clearInterval(id);
  }, [target]);

  const display = remaining ?? { days: 0, hours: 0, minutes: 0, seconds: 0 };

  return (
    <div
      className="mt-10 grid grid-cols-4 gap-3 sm:gap-5"
      role="timer"
      aria-live="off"
      aria-label={
        remaining
          ? `${remaining.days} days, ${remaining.hours} hours, ${remaining.minutes} minutes and ${remaining.seconds} seconds until ordering opens`
          : undefined
      }
    >
      {UNITS.map(({ key, label }) => (
        <div
          key={key}
          className="flex flex-col items-center rounded-2xl border border-maroon/15 bg-cream/70 px-3 py-4 sm:px-5 sm:py-6"
        >
          <span
            className="font-display text-3xl tabular-nums text-maroon sm:text-4xl"
            aria-hidden="true"
          >
            {String(display[key]).padStart(2, "0")}
          </span>
          <span className="mt-1 text-[11px] uppercase tracking-[0.14em] text-charcoal/50 sm:text-xs">
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}
