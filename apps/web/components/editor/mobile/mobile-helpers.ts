import { preconnect, preload } from "react-dom";
import {
  buildMobileFilter,
  savePref,
  loadPref,
} from "@/lib/mobile-layout";
import type { MobileLayout } from "@/lib/mobile-layout";

export { NOOP } from "@/lib/utils";
export const DEFAULT_SPLIT = 0.5;

export { FILENAME_SANITIZE_RE } from "@/lib/video-file";
export const TRIM_TIME_RE = /^\d+(\.\d+)?$/;
void TRIM_TIME_RE;

export const HEAVY_MODULES = {
  portrait: () => import("@/components/editor/MobilePreviewShared"),
} as const;

let didPreconnect = false;
export function ensurePreconnect() {
  if (didPreconnect || typeof window === "undefined") return;
  didPreconnect = true;
  try {
    preconnect("https://api.local");
    preload("/minozavr.png", { as: "image" } as unknown as Parameters<
      typeof preload
    >[1]);
  } catch {}
}

let didInitApp = false;
export function ensureAppInitOnce(): boolean {
  if (didInitApp) return false;
  didInitApp = true;
  ensurePreconnect();
  return true;
}

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
  const v = buildMobileFilter(layout, sw, sh, split);
  buildFilterCache.set(key, v);
  return v;
}

const layoutCache = new Map<string, MobileLayout | null>();
export function getCachedLayout(): MobileLayout | null {
  const key = "ffmpeg-mobile-layout-v1";
  if (layoutCache.has(key)) return layoutCache.get(key)!;
  const v = loadPref();
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
    schedule(() => savePref(l));
  } catch {
    savePref(l);
  }
}

import { fetchDownloadBlob, saveBlobFile } from "@/lib/save-blob-file";

export async function downloadAndSaveMobile(
  jobId: string,
  filename: string,
): Promise<string> {
  const { API_BASE_URL } = await import("@/lib/api-client");
  const downloadUrl = `${API_BASE_URL}/api/transcode/download/${jobId}`;
  const blob = await fetchDownloadBlob(downloadUrl);
  return saveBlobFile(blob, filename);
}
