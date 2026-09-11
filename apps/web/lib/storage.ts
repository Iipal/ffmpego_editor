// Storage service: observable store census + on-demand sweep for the local
// Hono API.
//
// `GET /api/storage/stats` returns the FileStore census from
// `apps/api/src/routes/files.ts` (managed bytes vs quota, file counts,
// per-role/per-kind breakdowns). `POST /api/storage/sweep` reaps expired /
// stale / orphan records without touching live jobs. The Admin dashboard goes
// through the `storage` singleton below instead of raw `fetch()` so timeout +
// error shaping live in one place. TanStack Query wiring lives in
// `hooks/useStorageStats.ts`; rendering lives in
// `components/admin/JobsArea.tsx`.
import { apiClient } from "./api-client";
import { fetchJson } from "./fetch-json";

/** Store census mirrored from `GET /api/storage/stats` (`store.stats()`). */
export interface StorageStats {
  files: number;
  bytes: number;
  quotaBytes: number;
  /** File counts by role (`asset` = inputs, `artifact` = outputs). */
  byRole: Record<string, number>;
  /** File counts by kind (`upload`, `output`, `ephemeral`, …). */
  byKind: Record<string, number>;
}

/** Result of `POST /api/storage/sweep` (`store.reconcile()` counters). */
export interface StorageSweepResult {
  expired: number;
  staleReserved: number;
  missing: number;
  orphans: number;
  bytesFreed: number;
  message?: string;
}

/**
 * Singleton service owning the storage census + sweep calls: one lightweight
 * GET/POST each with a short timeout. Unlike the jobs list, the census never
 * fans out per job — safe to poll on an interval.
 */
class Storage {
  /** Default timeout for stats/sweep calls (fail fast, don't hang). */
  private static readonly DEFAULT_TIMEOUT_MS = 8000;

  /**
   * Fetch the store census. Throws with a human message when the API is
   * unreachable, times out, or answers non-2xx.
   */
  async fetchStats(
    timeoutMs = Storage.DEFAULT_TIMEOUT_MS,
  ): Promise<StorageStats> {
    return fetchJson<StorageStats>("/api/storage/stats", {
      timeoutMs,
      label: "Storage stats",
    });
  }

  /**
   * Run an on-demand sweep (reap expired/stale/orphan store records).
   * Live jobs are never touched server-side. Resolves with freed-byte
   * counters for the confirmation toast.
   */
  async runSweep(
    timeoutMs = Storage.DEFAULT_TIMEOUT_MS,
  ): Promise<StorageSweepResult> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      return await apiClient.requestJson<StorageSweepResult>(
        "/api/storage/sweep",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
          signal: ctrl.signal,
        },
      );
    } finally {
      clearTimeout(timer);
    }
  }
}

/** App-wide singleton — Query hooks go through this. */
export const storage = new Storage();
