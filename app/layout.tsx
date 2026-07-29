import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Karla } from "next/font/google";
import { defaultMetadata } from "@/lib/seo/metadata";
import "./globals.css";

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const karla = Karla({
  variable: "--font-karla",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
});

export const metadata: Metadata = {
  // title/description/openGraph/twitter/metadataBase come from defaultMetadata
  // (lib/seo/metadata.ts) — the single source of truth for both the <title>
  // tag and the OG/Twitter share preview, so they can't drift into two
  // different pieces of copy. Previously this object only set title/
  // description inline and had no metadataBase/openGraph/twitter at all —
  // every page without its own generateMetadata (homepage, /search, all 7
  // legal pages) shared no preview image/title/description when linked, e.g.
  // over WhatsApp, the brand's primary customer channel.
  ...defaultMetadata,
  // Light-mode icons are the brand maroon mark; the media-scoped entries
  // below swap in a gold version for dark browser/OS themes — same
  // "gold on dark, maroon on light" convention already used for the email
  // templates' header/footer marks (lib/resend/index.ts).
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      {
        url: "/favicon-16x16-dark.png",
        sizes: "16x16",
        type: "image/png",
        media: "(prefers-color-scheme: dark)",
      },
      {
        url: "/favicon-32x32-dark.png",
        sizes: "32x32",
        type: "image/png",
        media: "(prefers-color-scheme: dark)",
      },
    ],
    apple: "/apple-touch-icon.png",
  },
};

// Explicit viewport so every device gets:
// - device-width so mobile browsers don't render at the desktop 980px width
// - initialScale 1 with maximumScale 5 (never lock to 1 — kills accessibility zoom)
// - viewportFit "cover" so the page paints into the iPhone notch / safe area
//   (paired with env(safe-area-inset-*) if we ever need edge-to-edge chrome)
// - themeColor = brand maroon so mobile browser chrome (Chrome address bar,
//   iOS Safari status pill) tints to match the top marquee
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: "#4a1f1f",
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${cormorant.variable} ${karla.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
