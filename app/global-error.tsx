"use client";

import { useEffect } from "react";

// Catches an error thrown by the ROOT layout itself (e.g. the font loader) —
// the one case app/error.tsx can't catch, since that boundary lives inside
// the root layout. This replaces app/layout.tsx entirely, including its
// <html>/<body>, so it can't rely on globals.css, Tailwind classes, the brand
// fonts, or any provider being mounted — inline styles only, kept minimal.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global error boundary]", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          backgroundColor: "#f6f1ea",
          color: "#2b2623",
          fontFamily:
            "Georgia, 'Times New Roman', serif, -apple-system, BlinkMacSystemFont, sans-serif",
        }}
      >
        <div style={{ maxWidth: 420, textAlign: "center" }}>
          <p
            style={{
              fontSize: 11,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.28em",
              color: "#8c6a5a",
              margin: 0,
            }}
          >
            Something went wrong
          </p>
          <h1
            style={{
              marginTop: 20,
              fontSize: 32,
              lineHeight: 1.15,
              color: "#4a1f1f",
              fontWeight: 500,
            }}
          >
            A stitch came undone.
          </h1>
          <p
            style={{
              marginTop: 14,
              fontSize: 15,
              lineHeight: 1.7,
              color: "rgba(43,38,35,0.65)",
            }}
          >
            Something unexpected happened loading this page. Please try
            again.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 28,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: 52,
              padding: "0 28px",
              borderRadius: 16,
              border: "none",
              background: "#8c6a5a",
              color: "#f6f1ea",
              fontSize: 11,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.24em",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
