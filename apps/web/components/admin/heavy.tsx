"use client";

import dynamic from "next/dynamic";
import type { Card } from "@/components/ui/card";
import type { Progress } from "@/components/ui/progress";

// bundle-analyzable-paths: explicit literal dynamic import map (statically analyzable)
// Heavy UI chunks split via next/dynamic. Each value is a fn () => import("literal-path")
// so bundler traces narrowly. Avoids broad bundle if path were variable.
// bundle-barrel-imports: direct per-file imports above (ui/button, ui/card, ui/progress)
// not barrel index, so only used modules load.
export const HEAVY_MODULES = {
  progress: () => import("@/components/ui/progress"),
  card: () => import("@/components/ui/card"),
} as const;

// bundle-defer-third-party + js-request-idle-callback: origin preconnect +
// mascot preload live in lib/heavy (initAppOnce), shared with subtitles/mobile.

// bundle-dynamic-imports: heavy Progress/Card lazy-loaded (still keep static imports for above-the-fold;
// dynamic variant demonstrates code-splitting & is used in JobRow fallback)
export const DynamicProgress = dynamic(
  () =>
    HEAVY_MODULES.progress().then((m) => ({
      default: m.Progress as unknown as React.ComponentType<
        React.ComponentProps<typeof Progress>
      >,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="h-1.5 w-full rounded bg-kumo-recessed animate-pulse" />
    ),
  },
);
export const DynamicCard = dynamic(
  () =>
    HEAVY_MODULES.card().then((m) => ({
      default: m.Card as unknown as React.ComponentType<
        React.ComponentProps<typeof Card>
      >,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-xl border border-kumo-line p-4 animate-pulse bg-kumo-recessed" />
    ),
  },
);

// bundle-preload: preload heavy chunk on hover/focus intent (reduces perceived latency)
export function preloadHeavyProgress() {
  if (typeof window !== "undefined") void HEAVY_MODULES.progress();
}
export function preloadHeavyCard() {
  if (typeof window !== "undefined") void HEAVY_MODULES.card();
}
export { preloadUploadChunked } from "@/lib/preload";
