"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { type ReactNode, useRef } from "react";

interface ScrollRailProps {
  children: ReactNode;
  className?: string;
}

export function ScrollRail({ children, className = "" }: ScrollRailProps) {
  const railRef = useRef<HTMLDivElement>(null);

  function scrollBy(direction: -1 | 1) {
    railRef.current?.scrollBy({
      left: direction * 280,
      behavior: "smooth",
    });
  }

  return (
    <div className="relative">
      <div
        ref={railRef}
        className={`flex snap-x gap-5 overflow-x-auto scroll-smooth pb-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className}`}
      >
        {children}
      </div>
      <div className="pointer-events-none absolute inset-y-0 left-0 right-0 flex items-center justify-between px-1">
        <button
          type="button"
          aria-label="Scroll left"
          onClick={() => scrollBy(-1)}
          className="pointer-events-auto grid h-10 w-10 place-items-center rounded-full border border-cream/42 bg-cream/40 text-maroon shadow-[0_12px_34px_rgba(43,38,35,0.12)] backdrop-blur-xl transition duration-700 hover:-translate-x-0.5 hover:bg-cream/70"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Scroll right"
          onClick={() => scrollBy(1)}
          className="pointer-events-auto grid h-10 w-10 place-items-center rounded-full border border-cream/42 bg-cream/40 text-maroon shadow-[0_12px_34px_rgba(43,38,35,0.12)] backdrop-blur-xl transition duration-700 hover:translate-x-0.5 hover:bg-cream/70"
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
