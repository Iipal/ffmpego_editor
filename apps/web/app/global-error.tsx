"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  // Runs outside the root layout: no global CSS, fonts, or providers here.
  // Plain elements + inline styles only (OS color scheme via light-dark()).
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          fontFamily: "system-ui, sans-serif",
          background: "light-dark(#f5f5f5, #111)",
          color: "light-dark(#111, #eee)",
          colorScheme: "light dark",
        }}
      >
        <title>FFmpeg Editor — error</title>
        <div
          role="alert"
          style={{
            maxWidth: 480,
            padding: 24,
            borderRadius: 8,
            border: "1px solid light-dark(#ddd, #333)",
            background: "light-dark(#fff, #1a1a1a)",
          }}
        >
          <h1 style={{ fontSize: 18, margin: "0 0 8px" }}>
            The app failed to load
          </h1>
          <p style={{ fontSize: 14, opacity: 0.7, margin: "0 0 16px" }}>
            A fatal error hit the root shell. Your uploaded files and jobs on
            the local server are untouched.
            {error.digest ? ` (ref ${error.digest})` : null}
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => retry()}
              style={{
                padding: "8px 16px",
                borderRadius: 6,
                border: "none",
                background: "#0d7ff2",
                color: "#fff",
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            <a
              href="/editor/crop"
              style={{ alignSelf: "center", fontSize: 14 }}
            >
              Back to editor
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
