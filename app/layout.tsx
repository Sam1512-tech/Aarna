import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Karla } from "next/font/google";
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
  title: {
    default: "Aarna - made to live in",
    template: "%s - Aarna",
  },
  description:
    "Aarna by Arpitha Abhishek is a slow-made women's clothing line for soft everyday rituals, intimate gatherings, travel, and thoughtful styling.",
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
