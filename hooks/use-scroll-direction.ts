"use client";

import { useEffect, useRef, useState } from "react";

// Ignores trackpad/wheel micro-jitter so a barely-there scroll doesn't
// toggle visibility.
const DIRECTION_THRESHOLD_PX = 8;
// Never hide while still near the very top — otherwise the bar can flicker
// hidden on the first downward pixel of a page that hasn't really been
// scrolled yet.
const TOP_GUARD_PX = 40;

/**
 * True once the user has scrolled down past the top guard and hasn't
 * scrolled back up since — the signal a "hide on scroll-down, reveal on
 * scroll-up" bar reacts to. rAF-gated (mirrors product-detail-view.tsx's
 * existing gallery-rail scroll tracker) so this never fires more than once
 * per frame.
 */
export function useScrollDirection() {
  const [hidden, setHidden] = useState(false);
  const lastScrollY = useRef(0);
  const tickingRef = useRef(false);

  useEffect(() => {
    lastScrollY.current = window.scrollY;

    function onScroll() {
      if (tickingRef.current) return;
      tickingRef.current = true;
      requestAnimationFrame(() => {
        const currentY = window.scrollY;
        const delta = currentY - lastScrollY.current;

        if (currentY <= TOP_GUARD_PX) {
          setHidden(false);
        } else if (delta > DIRECTION_THRESHOLD_PX) {
          setHidden(true);
        } else if (delta < -DIRECTION_THRESHOLD_PX) {
          setHidden(false);
        }

        lastScrollY.current = currentY;
        tickingRef.current = false;
      });
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return hidden;
}
