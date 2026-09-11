import { queryKeys } from "@/lib/query-keys";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  storage,
  type StorageStats,
  type StorageSweepResult,
} from "@/lib/storage";

export type { StorageStats, StorageSweepResult };

/**
 * Store census query (`GET /api/storage/stats`): managed bytes vs quota,
 * file counts, per-role/per-kind breakdowns. Polled on a 30 s interval so
 * the `JobsArea` quota bar stays fresh; the census is a single cheap
 * aggregate query, unlike the per-job list.
 */
export function useStorageStatsQuery() {
  return useQuery({
    queryKey: queryKeys.storageStats,
    queryFn: () => storage.fetchStats(),
    // Poll lightly — single aggregate query, no per-job fan-out.
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    retry: 1,
    staleTime: 20_000,
    gcTime: 60_000,
  });
}

/**
 * On-demand sweep mutation (`POST /api/storage/sweep`): reaps expired /
 * stale / orphan store records without touching live jobs. Invalidates the
 * census on success so the quota bar reflects the freed bytes.
 */
export function useStorageSweepMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => storage.runSweep(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.storageStats });
    },
  });
}
