import Image from "next/image";

/**
 * Global loading UI — the "Refresh Page". Rendered by the App Router as the
 * Suspense fallback during route transitions and long RSC waits.
 *
 * Sits on top of the header so the transition feels like a single, calm brand
 * moment. Uses the footer wordmark (which already carries "Aarna by Arpitha
 * Abhishek" as designed lockup), so no auxiliary text is needed.
 */
export default function Loading() {
  return (
    <main
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="fixed inset-0 z-[200] flex items-center justify-center overflow-hidden bg-cream px-6"
    >
      {/*
        paper-grain applies position: relative in globals.css and would clash
        with fixed on the outer <main>, so we attach the texture to a
        non-positioned inner overlay instead.
      */}
      <div
        className="paper-grain pointer-events-none absolute inset-0"
        aria-hidden="true"
      />

      <div className="relative flex flex-col items-center text-center">
        {/*
          Rotating hairline refresh mark. A ¾ hairline arc on a very faint
          full ring — spins on a slow, linear loop so it reads as calm and
          continuous rather than rushed.
        */}
        <div
          className="mb-12 h-9 w-9 md:mb-14 md:h-10 md:w-10"
          aria-hidden="true"
        >
          <svg
            viewBox="0 0 40 40"
            className="h-full w-full animate-[spin_1.8s_linear_infinite]"
          >
            <circle
              cx="20"
              cy="20"
              r="16"
              fill="none"
              stroke="rgba(140,106,90,0.18)"
              strokeWidth="1.25"
            />
            <path
              d="M20 4 A16 16 0 0 1 36 20"
              fill="none"
              stroke="#8c6a5a"
              strokeWidth="1.25"
              strokeLinecap="round"
            />
          </svg>
        </div>

        <Image
          src="/brand/aarna-footer-logo-transparent.png"
          alt="Aarna by Arpitha Abhishek"
          width={640}
          height={420}
          priority
          className="logo-blend w-full max-w-[320px] object-contain md:max-w-[440px]"
        />

        <span className="sr-only">Loading Aarna</span>
      </div>
    </main>
  );
}
