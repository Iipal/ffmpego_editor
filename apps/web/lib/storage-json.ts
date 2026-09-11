// Best-effort localStorage JSON round-trips: never throws (SSR, corrupt
// JSON, quota, private mode all degrade to null/no-op) so callers keep only
// their shape validation. Replaces the hand-rolled try/catch
// getItem/setItem stanzas previously copy-pasted across every service.
//
// Note: `private type` inside a class is not valid TypeScript (type members
// can't take modifiers), so the key union lives at module scope without an
// export — private to this file, which is the same guarantee.

/** Every localStorage key the app reads or writes, as string literals. */
export type StorageKey =
  | "ffmpego:trim_range"
  | "ffmpego:export_history"
  | "ffmpego:subtitle_templates"
  | "ffmpego:upload_resume"
  | "ffmpego:mobile_layout"
  | "ffmpego:mobile_layout:stacked"
  | "ffmpego:mobile_layout:full"
  | "ffmpego:presets"
  | "ffmpego:crop"
  | "ffmpego:admin_filters"
  | "ffmpego:sidebar_collapsed";

class StorageJSON {
  /**
   * Read `key` and parse its JSON body as `T`. Returns null when the key
   * is missing, the body isn't valid JSON, or storage is unavailable
   * (SSR, private mode) — callers validate the shape, never the I/O.
   */
  read<T>(key: StorageKey): T | null {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }

  /**
   * Stringify `value` into `key`. Best-effort: quota or private-mode
   * failures are swallowed — the value simply doesn't survive reloads.
   */
  write(key: StorageKey, value: unknown): void {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  }

  /**
   * Drop `key` entirely. Best-effort like `write` — failures are swallowed.
   */
  remove(key: StorageKey): void {
    if (typeof window === "undefined") return;
    try {
      localStorage.removeItem(key);
    } catch {}
  }
}

/** App-wide singleton — services persist through this instead of raw localStorage. */
export const storageJSON = new StorageJSON();
