"use client";

import { useEffect, useRef } from "react";

// Long enough that a keyboard user cycling through a <select>'s options with
// repeated arrow presses never triggers more than one navigation — short
// enough that picking a value still feels like it "just applies" without a
// separate click, matching how the checkbox fields below already behave.
const SELECT_DEBOUNCE_MS = 400;

/**
 * Drop-in replacement for a GET filter <form> — any <select> or checkbox
 * <input> inside auto-submits the form as its value settles, so
 * dropdown/checkbox filters apply without a click on the "filter" button.
 * Text <input>s are left alone (still submit on Enter or via the button) —
 * auto-submitting on every keystroke would be a worse UX, not a better one.
 */
export function AutoSubmitForm({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  function submitNow() {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    formRef.current?.requestSubmit();
  }

  return (
    <form
      ref={formRef}
      method="get"
      className={className}
      onChange={(e) => {
        const target = e.target;
        // Checkboxes are genuinely safe to submit the instant they change —
        // one click/keypress is one committed choice, nothing to debounce.
        if (target instanceof HTMLInputElement && target.type === "checkbox") {
          submitNow();
          return;
        }
        // A native, closed <select> fires a `change` event on every
        // individual arrow-key press while it's focused — not just once
        // when the user settles on a final option — a well-established,
        // cross-browser platform behavior distinct from how a mouse click
        // on an open listbox behaves. Wiring that straight to
        // requestSubmit() bounced a keyboard user pressing ArrowDown 3
        // times through 3 unwanted full-page reloads before ever reaching
        // the option they wanted, each resetting scroll and focus (WCAG
        // 3.2.2 On Input). Debouncing collapses any run of rapid changes —
        // a keyboard arrow-cycle — into a single submit once the user
        // settles, while still feeling close to instant for the ordinary
        // mouse-click case.
        if (target instanceof HTMLSelectElement) {
          if (debounceRef.current) clearTimeout(debounceRef.current);
          debounceRef.current = setTimeout(submitNow, SELECT_DEBOUNCE_MS);
        }
      }}
    >
      {children}
    </form>
  );
}
