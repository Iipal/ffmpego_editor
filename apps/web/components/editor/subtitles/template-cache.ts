import type { StorageKey } from "@/lib/storage-json";
import type { SubtitleTemplate } from "@/lib/subtitles/subtitleStorage";
import {
  SubtitleStorage,
  subtitleStorage,
} from "@/lib/subtitles/subtitleStorage";

// js-cache-storage: module-level cache for localStorage reads (avoid sync I/O per render)
// Single-key cache (STORAGE_KEY only) — no LRU eviction needed.
const templateStorageCache = new Map<StorageKey, SubtitleTemplate[]>();

// js-cache-storage: invalidate on external changes (other tabs)
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if ((e.key as StorageKey) === "ffmpego:subtitle_templates") {
      templateStorageCache.delete("ffmpego:subtitle_templates");
    }
  });
}

export function getCachedTemplates(): SubtitleTemplate[] {
  const key: StorageKey = "ffmpego:subtitle_templates";

  if (templateStorageCache.has(key)) return templateStorageCache.get(key)!;

  const v = subtitleStorage.load();
  templateStorageCache.set(key, v);

  return v;
}

export function setCachedTemplates(templates: SubtitleTemplate[]) {
  templateStorageCache.set("ffmpego:subtitle_templates", templates);
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
