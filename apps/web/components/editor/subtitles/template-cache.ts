import type { SubtitleTemplate } from "@/lib/subtitles/subtitleStorage";
import {
  SubtitleStorage,
  subtitleStorage,
} from "@/lib/subtitles/subtitleStorage";

// js-cache-storage: module-level cache for localStorage reads (avoid sync I/O per render)
// Single-key cache (STORAGE_KEY only) — no LRU eviction needed.
const templateStorageCache = new Map<string, SubtitleTemplate[]>();

// js-cache-storage: invalidate on external changes (other tabs)
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === SubtitleStorage.STORAGE_KEY) {
      templateStorageCache.delete(SubtitleStorage.STORAGE_KEY);
    }
  });
}

export function getCachedTemplates(): SubtitleTemplate[] {
  const key = SubtitleStorage.STORAGE_KEY;
  if (templateStorageCache.has(key)) return templateStorageCache.get(key)!;
  const v = subtitleStorage.load();
  templateStorageCache.set(key, v);
  return v;
}

export function setCachedTemplates(templates: SubtitleTemplate[]) {
  templateStorageCache.set(SubtitleStorage.STORAGE_KEY, templates);
  const schedule =
    typeof window !== "undefined" && "requestIdleCallback" in window
      ? (cb: () => void) =>
          (
            window as unknown as {
              requestIdleCallback: (cb: () => void) => number;
            }
          ).requestIdleCallback(cb)
      : (cb: () => void) => setTimeout(cb, 0);
  schedule(() => {
    try {
      subtitleStorage.save(templates);
    } catch {}
  });
}
