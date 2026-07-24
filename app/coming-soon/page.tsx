import Image from "next/image";
import type { Metadata } from "next";
import { ordersOpenAt } from "@/lib/launch-gate";
import { ComingSoonCountdown } from "@/components/storefront/coming-soon-countdown";

export const metadata: Metadata = {
  title: "Opening soon",
  robots: { index: false, follow: false },
};

const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "Asia/Kolkata",
};

export default function ComingSoonPage() {
  const opensAt = ordersOpenAt();

  return (
    <main className="paper-grain flex min-h-screen flex-col items-center justify-center bg-cream px-6 py-16 text-center">
      <Image
        src="/brand/aarna-header-logo-transparent.png"
        alt="Aarna"
        width={72}
        height={72}
        className="logo-blend h-16 w-16 object-contain"
        priority
      />

      <p className="mt-6 text-xs uppercase tracking-[0.22em] text-cocoa">
        Aarna by Arpitha Abhishek
      </p>

      <h1 className="mt-4 max-w-xl text-4xl text-maroon sm:text-5xl">
        We&rsquo;re almost ready to open our doors.
      </h1>

      <p className="mt-5 max-w-md text-sm leading-6 text-charcoal/70 sm:text-base">
        {opensAt
          ? `Ordering opens ${opensAt.toLocaleDateString("en-IN", DATE_FORMAT)}. Come back then — or check back here.`
          : "Ordering opens shortly. Come back soon."}
      </p>

      {opensAt ? (
        <ComingSoonCountdown targetIso={opensAt.toISOString()} />
      ) : null}
    </main>
  );
}
