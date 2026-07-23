import type { NextConfig } from "next";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseWs = supabaseUrl.replace(/^https:/, "wss:");

// Content-Security-Policy — an allowlist-based baseline, not the strictest
// possible (nonce-based) CSP. Every external host below is something the app
// actually loads at runtime, checked against the real code, not guessed:
//   - Razorpay: checkout.js is loaded via next/script on /checkout
//     (app/(storefront)/checkout/page.tsx), and its modal opens its own
//     frames/XHRs to other razorpay.com subdomains during payment.
//   - Cloudinary: the only image host (next.config's own images.remotePatterns
//     already restricts next/image to this account). The admin category
//     image picker also loads Cloudinary's Upload Widget script client-side
//     (lib/cloudinary/widget-client.ts, https://widget.cloudinary.com) and
//     that widget uploads directly to Cloudinary's API from the browser —
//     both need a *.cloudinary.com allowance, not just img-src.
//   - Supabase: every supabase-js call (auth, session refresh) is an XHR to
//     this project's URL. Google sign-in itself is a full top-level page
//     navigation (see components/storefront/google-signin-button.tsx), not an
//     embedded resource, so it needs no CSP allowance of its own.
// `unsafe-inline` on script/style is a pragmatic baseline — Next.js's inline
// bootstrap scripts and Tailwind's inline styles need it; the strict fix is a
// per-request nonce threaded through middleware, which is a bigger change
// than this pass. This still blocks the common case (a third-party script
// injected via XSS that isn't already one of the hosts below).
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://checkout.razorpay.com https://*.razorpay.com https://*.cloudinary.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://res.cloudinary.com",
  "font-src 'self' data:",
  `connect-src 'self' ${supabaseUrl} ${supabaseWs} https://*.razorpay.com https://*.cloudinary.com`.trim(),
  "frame-src 'self' https://*.razorpay.com",
  "frame-ancestors 'none'",
  "form-action 'self' https://accounts.google.com",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

const nextConfig: NextConfig = {
  images: {
    // next/image refuses remote hosts unless allowlisted. All product,
    // banner, and brand media is served from this Cloudinary account —
    // the pathname pin keeps other Cloudinary accounts' assets out of
    // our image optimizer.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
        pathname: "/dnlzgwzeo/**",
      },
    ],
  },

  async headers() {
    return [
      {
        // Applies to every route — storefront, admin, and API alike.
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: CSP },
          // Belt-and-suspenders alongside frame-ancestors above — older
          // browsers that don't support CSP frame-ancestors still respect this.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
