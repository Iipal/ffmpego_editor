"use client";

// bundle-analyzable-paths: explicit literal import map (statically analyzable)
// Heavy UI chunks preloaded on hover/focus intent. Each value is a fn () => import("literal-path")
// so bundler traces narrowly. Avoids broad bundle if path were variable.
export const HEAVY_MODULES = {
  progress: () => import("@/components/ui/progress"),
  card: () => import("@/components/ui/card"),
} as const;

// bundle-defer-third-party + js-request-idle-callback: origin preconnect +
// mascot preload live in lib/heavy (initAppOnce), shared with subtitles/mobile.

// bundle-preload: preload heavy chunk on hover/focus intent (reduces perceived latency)
export function preloadHeavyProgress() {
  if (typeof window !== "undefined") void HEAVY_MODULES.progress();
}
export function preloadHeavyCard() {
  if (typeof window !== "undefined") void HEAVY_MODULES.card();
}
