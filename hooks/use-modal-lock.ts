"use client";

import { useEffect } from "react";

/**
 * Shared behavior every modal/dialog in the app needs: lock body scroll
 * while open (so the page underneath can't scroll behind the overlay — a
 * fixed header/marquee left unlocked will drift out of sync with the
 * content behind it, and on iOS Safari specifically an unlocked body lets
 * the rubber-band overscroll bounce visibly jostle fixed-position elements
 * mid-gesture) and close on Escape.
 *
 * Only one modal in the app (size-guide-modal.tsx) originally had this;
 * every other one had either half of it (Escape only, copied without the
 * scroll lock) or neither. Centralized here so every dialog gets both for
 * free, and any future modal that reaches for this hook can't repeat the
 * same partial copy.
 */
export function useModalLock(active: boolean, onClose?: () => void) {
  useEffect(() => {
    if (!active) return;

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose?.();
    }
    document.addEventListener("keydown", onKey);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [active, onClose]);
}
