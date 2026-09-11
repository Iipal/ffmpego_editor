"use client";

import dynamic from "next/dynamic";

// bundle-analyzable-paths: explicit literal dynamic import map (statically analyzable)
export const HEAVY_MODULES = {
  mobilePreview: () => import("@/components/editor/MobilePreviewShared"),
  subtitlePng: () => import("@/lib/subtitles/renderSubtitlePng"),
  apiClient: () => import("@/lib/api-client"),
  googleFontPicker: () => import("@/components/editor/GoogleFontPicker"),
} as const;

// bundle-defer-third-party + rendering-resource-hints: origin preconnect +
// mascot preload live in lib/heavy (initAppOnce), shared with admin/mobile.

// bundle-dynamic-imports: heavy MobilePreviewShared lazy-loaded (CRITICAL for TTI)
export type MobilePreviewSharedProps = React.ComponentProps<
  typeof import("@/components/editor/MobilePreviewShared").MobilePreviewShared
>;

export const DynamicMobilePreviewShared = dynamic(
  () =>
    HEAVY_MODULES.mobilePreview().then((m) => ({
      default:
        m.MobilePreviewShared as unknown as React.ComponentType<MobilePreviewSharedProps>,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="mx-auto aspect-9/16 w-full max-w-70 rounded-xl border border-kumo-line bg-kumo-recessed animate-pulse" />
    ),
  },
);

// bundle-preload: preload heavy chunk on hover/focus intent
export function preloadMobilePreview() {
  if (typeof window !== "undefined") void HEAVY_MODULES.mobilePreview();
}

// bundle-dynamic-imports: GoogleFontPicker pulls Popover+Command+font catalog;
// lazy-load it — only needed when a subtitle is selected (conditional loading)
export type GoogleFontPickerProps = React.ComponentProps<
  typeof import("@/components/editor/GoogleFontPicker").GoogleFontPicker
>;

export const DynamicGoogleFontPicker = dynamic(
  () =>
    HEAVY_MODULES.googleFontPicker().then((m) => ({
      default:
        m.GoogleFontPicker as unknown as React.ComponentType<GoogleFontPickerProps>,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="h-9 w-full rounded-md border border-kumo-line bg-kumo-recessed animate-pulse" />
    ),
  },
);

export function preloadExportChunks() {
  if (typeof window !== "undefined") {
    void HEAVY_MODULES.subtitlePng();
    void HEAVY_MODULES.apiClient();
  }
}
