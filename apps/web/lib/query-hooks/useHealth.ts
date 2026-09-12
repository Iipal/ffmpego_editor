import { queryKeys } from "./query-keys";
import { useQuery } from "@tanstack/react-query";
import { health, type HealthSnapshot } from "../health";

export type { HealthSnapshot };

/**
 * Readiness snapshot query (`GET /health`): ffmpeg build line, tmpdir disk
 * headroom, and queue depth. Polled on a 15 s interval so `AdminHeader` /
 * `JobsArea` stay fresh without touching the heavy jobs table; the snapshot
 * is tiny and failure-tolerant server-side (nulls when probes fail).
 */
export function useHealthQuery() {
  return useQuery({
    queryKey: queryKeys.health,
    queryFn: () => health.fetchHealth(),
    // Poll lightly — this endpoint never touches SQLite, unlike jobs/SSE.
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
    retry: 1,
    staleTime: 10_000,
    gcTime: 60_000,
  });
}
