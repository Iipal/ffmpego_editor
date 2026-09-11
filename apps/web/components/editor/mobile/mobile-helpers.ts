export const DEFAULT_SPLIT = 0.5;

export const HEAVY_MODULES = {
  portrait: () => import("@/components/editor/MobilePreviewShared"),
} as const;

// bundle-defer-third-party + rendering-resource-hints: origin preconnect +
// mascot preload live in lib/heavy (initAppOnce), shared with admin/subtitles.

export function preloadHeavyPreview() {
  if (typeof window !== "undefined") void HEAVY_MODULES.portrait();
}

export type PointerHandler = (e: PointerEvent) => void;
// Shared deduped global pointer bus (single copy in lib/global-listener-bus).
export {
  ensureGlobalPointerListeners,
  globalPointerMoveHandlers,
  globalPointerUpHandlers,
} from "@/lib/global-listener-bus";
