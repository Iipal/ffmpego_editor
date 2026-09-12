// Health service: lightweight readiness snapshot for the local Hono API.
//
// `GET /health` (root, not under `/api`) returns the ops snapshot from
// `apps/api/src/index.ts`: ffmpeg build line, tmpdir disk headroom, and queue
// depth. Editors and Admin go through the `health` singleton below instead of
// the shared axios funnel (`query-hooks/http.getJson`) so timeout + error
// shaping live in one place. TanStack Query
// wiring lives in `lib/query-hooks/useHealth.ts`; rendering lives in
// `components/admin/AdminHeader.tsx` + `JobsArea.tsx`.
import { getJson } from "./query-hooks/http";

/** Queue depth snapshot mirrored from `GET /health` (`getQueueStats`). */
export interface HealthQueueStats {
  active: number;
  queued: number;
  maxConcurrent: number;
  maxQueued: number;
}

/** Ops snapshot returned by `GET /health`. Probes are failure-tolerant. */
export interface HealthSnapshot {
  status: "ok";
  timestamp: string;
  ffmpegPath: string;
  ffmpegVersion: string | null;
  tmpdir: string;
  diskFreeBytes: number | null;
  diskFreeHuman: string | null;
  queue: HealthQueueStats;
}

/**
 * Singleton service owning the readiness probe: one lightweight GET with a
 * short timeout. Unlike the old `GET /api/transcode/jobs` probe, this never
 * touches SQLite or the jobs table — safe to poll on an interval.
 */
class Health {
  /** Default timeout for the readiness probe (fail fast, don't hang). */
  private static readonly DEFAULT_TIMEOUT_MS = 4000;

  /**
   * Fetch the ops snapshot. Throws with a human message when the API is
   * unreachable, times out, or answers non-2xx — callers (Query `queryFn`,
   * `preflight.probeApiConnectivity`) surface `error.message` directly.
   */
  async fetchHealth(
    timeoutMs = Health.DEFAULT_TIMEOUT_MS,
  ): Promise<HealthSnapshot> {
    return getJson<HealthSnapshot>("/health", {
      timeoutMs,
      label: "Health check",
    });
  }
}

/** App-wide singleton — Query hooks and preflight probe through this. */
export const health = new Health();
