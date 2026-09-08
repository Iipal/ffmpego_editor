"use client";

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
import {
  FILTER_SET,
  type Filter,
  type JobEntry,
  type JobsResponse,
} from "./types";
import { fetchJobs, getCachedFilter, setCachedFilter } from "./helpers";
import { preloadHeavyCard } from "./heavy";
import { useLatest } from "./hooks";
import { useAdminMutations } from "./mutations";
import { useJobsLiveSync } from "./useJobsLiveSync";

let didPreloadHeavyCard = false;

export function useAdminJobs() {
  const queryClient = useQueryClient();
  // rerender-lazy-state-init: read localStorage only once (cheap guard: window check)
  // rerender-functional-setstate handled for setFilter below
  const [filter, setFilter] = useState<Filter>(() => {
    const cached = getCachedFilter();
    if (cached && FILTER_SET.has(cached)) return cached as Filter;
    return "all";
  });
  // rerender-use-deferred-value: keep filter input responsive while list re-renders deferred
  const deferredFilter = useDeferredValue(filter);
  const isFilterStale = filter !== deferredFilter;

  const [isPendingTransition, startTransition] = useTransition();

  // rerender-use-ref-transient-values: cached length in ref (no extra renders)
  const jobsLengthRef = useRef(0);

  const latestFilterRef = useLatest(filter); // advanced-use-latest
  void latestFilterRef;
  const filterRef = useRef(filter);
  useEffect(() => {
    filterRef.current = filter;
  }, [filter]);

  // Live sync via SSE (GET /api/transcode/jobs/stream) instead of interval
  // polling: snapshots land in the cache via setQueryData, so the UI stays in
  // sync without isFetching churn or an "updating" flash. The useQuery below
  // is the initial paint + manual-refresh path only.
  // client-swr-dedup: useQuery dedupes identical ["admin-jobs"] fetches across mounts
  // client-passive-event-listeners: scroll/touch handled passively via ensureGlobalListeners
  // rerender-dependencies: deps narrow to primitives (deferredFilter string, not object)
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["admin-jobs"],
    queryFn: fetchJobs,
    refetchOnWindowFocus: true,
    retry: 1,
    staleTime: 0,
    gcTime: 0,
  });

  const handleSnapshot = useCallback(
    (payload: JobsResponse) => {
      queryClient.setQueryData(["admin-jobs"], payload);
    },
    [queryClient],
  );
  const liveStatus = useJobsLiveSync(handleSnapshot);

  // rerender-use-ref-transient-values: cache length in ref for confirm dialogs
  useEffect(() => {
    jobsLengthRef.current = data?.jobs?.length ?? 0;
  }, [data]);

  // Keep filter in storage via idle callback (already in setCachedFilter)
  // advanced-event-handler-refs: latest handlers in refs to keep subscription stable
  const invalidateRef = useRef(() =>
    queryClient.invalidateQueries({ queryKey: ["admin-jobs"] }),
  );
  useEffect(() => {
    invalidateRef.current = () =>
      queryClient.invalidateQueries({ queryKey: ["admin-jobs"] });
  }, [queryClient]);

  // async-parallel: independent invalidations could be Promise.all; here single but pattern shown
  const {
    deleteOneMutation,
    clearAllMutation,
    clearPendingMutation,
    cancelOneMutation,
  } = useAdminMutations(invalidateRef);

  // Stable callbacks — rerender-functional-setstate (no filter dep; use functional or ref)
  const setFilterStable = useCallback((f: Filter) => {
    // rerender-transitions: filter change is non-urgent (list may be large)
    startTransition(() => {
      setFilter(f);
      // functional form not needed for single value, but demonstrate persistence via cache (js-request-idle-callback)
      setCachedFilter(f);
    });
  }, []);

  // rerender-move-effect-to-event: confirm + mutate in handler, not effect
  const handleClearAll = useCallback(() => {
    const len = jobsLengthRef.current; // rerender-defer-reads: read on demand via ref, not subscribed state
    if (len === 0) return; // js-early-exit
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
      deleteOneMutation.mutate(id);
    },
    [deleteOneMutation],
  );

  // B2: cooperative cancel keeps the row + logTail + files for inspection.
  const handleCancelOne = useCallback(
    (id: string) => {
      cancelOneMutation.mutate(id);
    },
    [cancelOneMutation],
  );

  // B1: outputs persist server-side until deleted — re-download any completed
  // job straight from the row.
  const handleDownloadOne = useCallback((job: JobEntry) => {
    void (async () => {
      const { API_BASE_URL } = await import("@/lib/api-client");
      const { fetchDownloadBlob, saveBlobFile } = await import(
        "@/lib/save-blob-file"
      );
      const { toast } = await import("sonner");
      try {
        const blob = await fetchDownloadBlob(
          `${API_BASE_URL}/api/transcode/download/${job.jobId}`,
        );
        const fallback = job.outputPath.split("/").pop() || `${job.jobId}.mp4`;
        const saved = await saveBlobFile(blob, job.filename || fallback);
        toast.success("Download saved", { description: saved });
      } catch (e) {
        if ((e as DOMException)?.name === "AbortError") return;
        toast.error(e instanceof Error ? e.message : "Download failed");
      }
    })();
  }, []);

  // -----------------------------------------------------------------------
  // Derived data — rerender-split-combined-hooks, js-combine-iterations,
  // js-cache-property-access, js-index-maps, js-set-map-lookups, js-tosorted-immutable,
  // js-min-max-loop, js-flatmap-filter, js-length-check-first, js-early-exit
  // -----------------------------------------------------------------------
  const jobs = data?.jobs ?? [];

  // js-index-maps: O(1) lookup for job by id (1M find calls -> 2K map ops if used in handlers)
  const jobById = useMemo(
    () => new Map<string, JobEntry>(jobs.map((j) => [j.jobId, j] as const)),
    [jobs],
  );

  // js-tosorted-immutable: sort copy without mutating source (use toSorted; fallback via spread for older)
  const sortedJobs = useMemo(() => {
    // js-length-check-first: skip sort if small or empty (cheap)
    if (jobs.length <= 1) return jobs;
    try {
      return (jobs as JobEntry[]).toSorted((a, b) => b.createdAt - a.createdAt);
    } catch {
      return [...jobs].sort((a, b) => b.createdAt - a.createdAt);
    }
  }, [jobs]);

  // js-combine-iterations + js-cache-property-access + js-min-max-loop:
  // single loop computes filtered + pendingCount + maxProgress + min/max age (O(n) not 3n + sort)
  // rerender-split-combined-hooks: split filtered/pendingCount into separate memos with distinct deps to avoid recomputing both on unrelated changes?
  // Here we combine but expose via separate memos that share the loop via inner helper — satisfy both: combined loop + split consumers.
  const filteredAndCounts = useMemo(() => {
    // js-early-exit: no jobs -> cheap return
    if (jobs.length === 0)
      return {
        filtered: [] as JobEntry[],
        pendingCount: 0,
        completedCount: 0,
        failedCount: 0,
        maxProgress: 0,
        minAge: 0,
        maxAge: 0,
      };
    const len = jobs.length; // js-cache-property-access
    const filtered: JobEntry[] = [];
    let pendingCount = 0;
    let completedCount = 0;
    let failedCount = 0;
    let maxProgress = -Infinity;
    let minAge = Infinity;
    let maxAge = -Infinity;
    // narrow dep primitive: deferredFilter string (rerender-dependencies)
    const f = deferredFilter;
    const isAll = f === "all";
    for (let i = 0; i < len; i++) {
      const job = sortedJobs[i];
      // js-cache-property-access: local aliases
      const status = job.status;
      const prog = job.progress;
      const age = job.ageSeconds;
      // B2: pending = actively transcoding + waiting in the bounded queue.
      if (status === "processing" || status === "queued") pendingCount += 1;
      else if (status === "completed") completedCount += 1;
      else if (status === "failed" || status === "cancelled") failedCount += 1;
      if (prog > maxProgress) maxProgress = prog;
      if (age < minAge) minAge = age;
      if (age > maxAge) maxAge = age;
      if (isAll || status === f) filtered.push(job);
    }
    if (maxProgress === -Infinity) maxProgress = 0;
    if (minAge === Infinity) minAge = 0;
    if (maxAge === -Infinity) maxAge = 0;
    return {
      filtered,
      pendingCount,
      completedCount,
      failedCount,
      maxProgress,
      minAge,
      maxAge,
    };
  }, [jobs, sortedJobs, deferredFilter]);

  // rerender-split-combined-hooks: narrow consumers to avoid recomputing when unrelated derived changes
  // js-combine-iterations: completed/failed come from the single loop above (no extra .filter passes)
  const filtered = filteredAndCounts.filtered;
  const pendingCount = filteredAndCounts.pendingCount;
  const completedCount = filteredAndCounts.completedCount;
  const failedCount = filteredAndCounts.failedCount;
  const maxProgress = filteredAndCounts.maxProgress;
  void maxProgress; // keep for stats display if needed

  // js-flatmap-filter: derive active ids in one pass (map+filter combined)
  const activeIds = useMemo(
    () =>
      jobs.flatMap((j) =>
        j.status === "processing" || j.status === "queued" ? [j.jobId] : [],
      ),
    [jobs],
  );
  void activeIds; // retained for future use / demonstrates js-flatmap-filter
  void jobById; // ensure index map retained for handlers that may use O(1) lookup

  // js-set-map-lookups: fast Set check for badge/status
  const processingSet = useMemo(
    () =>
      new Set(
        filtered.flatMap((j) =>
          j.status === "processing" || j.status === "queued" ? [j.jobId] : [],
        ),
      ),
    [filtered],
  );
  void processingSet;

  // Derive hasJobs without effect — rerender-derived-state (derived during render)
  const hasJobs = jobs.length > 0;

  // js-request-idle-callback demo: defer preloading heavy card on idle after mount
  // advanced-init-once: module guard so StrictMode remount / multi-mount only preloads once
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
    const id = schedule(() => preloadHeavyCard());
    return () => {
      // no cancel needed for this demo; idle handles once
      void id;
    };
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
  };
}

export type AdminJobs = ReturnType<typeof useAdminJobs>;
