// One shared resource-hint funnel behind every feature's hover/intent
// warming (admin jobs, subtitles, mobile): per-key init-once guard +
// origin preconnects + the mascot image preload. The per-feature dynamic()
// chunk maps stay where they are — chunk identity comes from the literal
// import path, so moving them would churn imports for zero bundle gain.
import { preconnect, preload } from "react-dom";

const inited = new Set<string>();

/**
 * Runs the preconnects for `key` once per app load (no-op afterwards).
 * Returns true on the first call. Keys are per-feature so the admin page
 * warming up first never steals the subtitles/fonts warmup.
 */
export function initAppOnce(key: string, urls: string[]): boolean {
  if (inited.has(key) || typeof window === "undefined") return false;
  inited.add(key);
  try {
    for (const url of urls) preconnect(url);
    preload("/minozavr.png", { as: "image" } as unknown as Parameters<
      typeof preload
    >[1]);
  } catch {}
  return true;
}
