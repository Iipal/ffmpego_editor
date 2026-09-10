import { mobileLayoutService } from "@/lib/mobile-layout";
import type { MobileLayout } from "@/lib/mobile-layout";

export { NOOP } from "@/lib/utils";
export const DEFAULT_SPLIT = 0.5;

export const TRIM_TIME_RE = /^\d+(\.\d+)?$/;
void TRIM_TIME_RE;

export const HEAVY_MODULES = {
  portrait: () => import("@/components/editor/MobilePreviewShared"),
} as const;

// bundle-defer-third-party + rendering-resource-hints: origin preconnect +
// mascot preload live in lib/heavy (initAppOnce), shared with admin/subtitles.

export function preloadHeavyPreview() {
  if (typeof window !== "undefined") void HEAVY_MODULES.portrait();
}

export { preloadUploadChunked } from "@/lib/preload";

export type PointerHandler = (e: PointerEvent) => void;
// Shared deduped global pointer bus (single copy in lib/global-listener-bus).
export {
  ensureGlobalPointerListeners,
  globalPointerMoveHandlers,
  globalPointerUpHandlers,
} from "@/lib/global-listener-bus";

const buildFilterCache = new Map<string, string>();
export function cachedBuildMobileFilter(
  layout: MobileLayout,
  sw: number,
  sh: number,
  split: number,
): string {
  const key = `${layout.mode}:${layout.splitRatio}:${layout.zones.map((z) => `${z.id}:${z.x},${z.y},${z.width},${z.height},${z.zoom}`).join("|")}:${sw}x${sh}:${split}`;
  if (buildFilterCache.has(key)) return buildFilterCache.get(key)!;
  const v = mobileLayoutService.buildMobileFilter(layout, sw, sh, split);
  buildFilterCache.set(key, v);
  return v;
}

const layoutCache = new Map<string, MobileLayout | null>();
export function getCachedLayout(): MobileLayout | null {
  const key = "ffmpeg-mobile-layout-v1";
  if (layoutCache.has(key)) return layoutCache.get(key)!;
  const v = mobileLayoutService.loadPref();
  layoutCache.set(key, v);
  return v;
}

export function setCachedLayout(l: MobileLayout) {
  layoutCache.set("ffmpeg-mobile-layout-v1", l);
  try {
    const schedule =
      typeof window !== "undefined" && "requestIdleCallback" in window
        ? (cb: () => void) =>
            (
              window as unknown as {
                requestIdleCallback: (cb: () => void) => number;
              }
            ).requestIdleCallback(cb)
        : (cb: () => void) => setTimeout(cb, 0);
    schedule(() => mobileLayoutService.savePref(l));
  } catch {
    mobileLayoutService.savePref(l);
  }
}
