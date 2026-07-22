"use client";

import { useRef } from "react";

/**
 * Drop-in replacement for a GET filter <form> — any <select> or checkbox
 * <input> inside auto-submits the form the moment its value changes, so
 * dropdown/checkbox filters apply immediately instead of requiring a click
 * on the "filter" button. Text <input>s are left alone (still submit on
 * Enter or via the button) — auto-submitting on every keystroke would be a
 * worse UX, not a better one.
 */
export function AutoSubmitForm({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      method="get"
      className={className}
      onChange={(e) => {
        const target = e.target;
        if (
          target instanceof HTMLSelectElement ||
          (target instanceof HTMLInputElement && target.type === "checkbox")
        ) {
          formRef.current?.requestSubmit();
        }
      }}
    >
      {children}
    </form>
  );
}
