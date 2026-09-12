"use client";

import { queryKeys } from "@/lib/query-hooks";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FILTER_SET, type Filter, type JobsResponse } from "./types";
import { fetchJobs } from "./helpers";
import { preloadHeavyCard } from "./heavy";
import { useAdminMutations } from "./mutations";
import { useJobsLiveSync } from "./useJobsLiveSync";
import { useAdminDerived } from "./useAdminDerived";
import { useAdminDownloads } from "./useAdminDownloads";
import { useAdminHistory } from "./useAdminHistory";
import { untrackHistoryEntry } from "@/store/exportHistorySlice";
import { storageJSON } from "@/lib/storage-json";

let didPreloadHeavyCard = false;

/**
 * Admin jobs composer: filter + jobs query (initial paint + manual refresh)
 * + SSE live sync + mutations. Derived list shaping lives in
 * `useAdminDerived`, downloads in `useAdminDownloads`, history-linked
 * compare/retry/rename in `useAdminHistory`.
 */
export function useAdminJobs() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>(() => {
    const cached = storageJSON.read<string>("ffmpego:admin_filters");
    if (cached && FILTER_SET.has(cached)) return cached as Filter;
    return "all";
  });
  const deferredFilter = useDeferredValue(filter);
  const isFilterStale = filter !== deferredFilter;

  const [isPendingTransition, startTransition] = useTransition();

  const jobsLengthRef = useRef(0);

  // Live sync via SSE (GET /api/transcode/jobs/stream) instead of interval
  // polling: snapshots land in the cache via setQueryData, so the UI stays in
  // sync without isFetching churn or an "updating" flash. The useQuery below
  // is the initial paint + manual-refresh path only.
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: queryKeys.adminJobs,
    queryFn: fetchJobs,
    retry: 1,
  });

  const handleSnapshot = useCallback(
    (payload: JobsResponse) => {
      queryClient.setQueryData(queryKeys.adminJobs, payload);
    },
    [queryClient],
  );
  const liveStatus = useJobsLiveSync(handleSnapshot);

  useEffect(() => {
    jobsLengthRef.current = data?.jobs?.length ?? 0;
  }, [data]);

  const invalidateJobs = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.adminJobs });
  }, [queryClient]);

  const {
    deleteOneMutation,
    clearAllMutation,
    clearPendingMutation,
    cancelOneMutation,
  } = useAdminMutations(invalidateJobs);

  const jobs = useMemo(() => data?.jobs ?? [], [data]);
  const { filtered, pendingCount, completedCount, failedCount, hasJobs } =
    useAdminDerived(jobs, deferredFilter);
  const { handleDownloadOne, handleDownloadAlternateOne } = useAdminDownloads();
  const {
    entryById,
    extractEntries,
    handleCompareOne,
    handleCompareAlternateOne,
    handleRetryEntry,
    handleRenameOne,
    handleExtractRename,
    handleExtractDelete,
  } = useAdminHistory(invalidateJobs);

  const setFilterStable = useCallback((f: Filter) => {
    startTransition(() => {
      setFilter(f);
      storageJSON.write("ffmpego:admin_filters", f);
    });
  }, []);

  const handleClearAll = useCallback(() => {
    const len = jobsLengthRef.current;
    if (len === 0) return;
    if (
      !confirm(
        `Delete all ${len} jobs? This kills hanging FFmpeg and deletes temp files.`,
      )
    )
      return;
    clearAllMutation.mutate();
  }, [clearAllMutation]);

  const handleClearPending = useCallback(() => {
    clearPendingMutation.mutate();
  }, [clearPendingMutation]);

  const handleRefresh = useCallback(() => {
    void refetch();
  }, [refetch]);

  const handleDeleteOne = useCallback(
    (id: string) => {
      untrackHistoryEntry(id); // drop any local retry/compare linkage
      deleteOneMutation.mutate(id);
    },
    [deleteOneMutation],
  );

  // Cooperative cancel keeps the row + logTail + files for inspection.
  const handleCancelOne = useCallback(
    (id: string) => {
      cancelOneMutation.mutate(id);
    },
    [cancelOneMutation],
  );

  useEffect(() => {
    if (didPreloadHeavyCard) return;
    didPreloadHeavyCard = true;
    const schedule =
      typeof window !== "undefined" && "requestIdleCallback" in window
        ? (cb: () => void) =>
            (
              window as unknown as {
                requestIdleCallback: (cb: () => void) => number;
              }
            ).requestIdleCallback(cb)
        : (cb: () => void) => setTimeout(cb, 1);
    schedule(() => preloadHeavyCard());
  }, []);

  return {
    data,
    jobs,
    filtered,
    filter,
    deferredFilter,
    isFilterStale,
    isPendingTransition,
    isLoading,
    isError,
    error,
    isFetching,
    pendingCount,
    completedCount,
    failedCount,
    hasJobs,
    liveStatus,
    deletePending: deleteOneMutation.isPending,
    clearAllPending: clearAllMutation.isPending,
    clearPendingPending: clearPendingMutation.isPending,
    cancelPending: cancelOneMutation.isPending,
    setFilterStable,
    handleClearAll,
    handleClearPending,
    handleRefresh,
    handleDeleteOne,
    handleCancelOne,
    handleDownloadOne,
    handleDownloadAlternateOne,
    handleCompareOne,
    handleCompareAlternateOne,
    handleRetryEntry,
    handleRenameOne,
    handleExtractRename,
    handleExtractDelete,
    entryById,
    extractEntries,
  };
}

export type AdminJobs = ReturnType<typeof useAdminJobs>;
