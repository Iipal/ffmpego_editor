"use client";

import { memo } from "react";
import { Button } from "@/components/ui/button";
import { apiBaseUrl, apiUrl } from "@/lib/query-hooks";
import { FILTER_OPTIONS, type Filter } from "./types";
import type { LiveStatus } from "./useJobsLiveSync";

type FilterBarProps = {
  deferredFilter: string;
  isFilterStale: boolean;
  liveStatus: LiveStatus;
  isPendingTransition: boolean;
  jobsLength: number;
  pendingCount: number;
  isError: boolean;
  error: Error | null;
  onSelect: (f: Filter) => void;
  onRefresh: () => void;
};

const LIVE_COPY: Record<LiveStatus, string> = {
  live: "live sync",
  connecting: "connecting…",
  reconnecting: "reconnecting…",
  error: "stream unavailable",
};

export const FilterBar = memo(function FilterBar({
  deferredFilter,
  isFilterStale,
  liveStatus,
  isPendingTransition,
  jobsLength,
  pendingCount,
  isError,
  error,
  onSelect,
  onRefresh,
}: FilterBarProps) {
  return (
    <>
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs">Filter:</span>
        {FILTER_OPTIONS.map((f) => (
          <Button
            key={f}
            variant={deferredFilter === f ? "default" : "outline"}
            size="xs"
            onClick={() => onSelect(f)}
            // narrow dep primitive f (rerender-dependencies)
            style={
              isFilterStale && deferredFilter === f
                ? { opacity: 0.7 }
                : undefined
            }
          >
            {f}
          </Button>
        ))}
        <span
          className="text-[10px] font-mono text-kumo-subtle ml-auto"
          suppressHydrationWarning
        >
          API: {apiUrl("/api/transcode/jobs")}
        </span>
      </div>
      <div
        className="text-[10px] font-mono text-kumo-subtle"
        suppressHydrationWarning
      >
        Storage: SQLite registry (apps/api/.data/app.sqlite) · temp input
        /tmp/&lt;uuid&gt;-* · output /tmp/temp_&lt;jobId&gt;.* kept until
        deleted. Survives restart. · {LIVE_COPY[liveStatus]}{" "}
        {isPendingTransition ? "· updating filter…" : null} · jobs: {jobsLength}{" "}
        · pending: {pendingCount}
      </div>
      {isError ? (
        <div className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
          {(error as Error).message} — check API at {apiBaseUrl()} is running &
          CORS allowed.
          <Button
            variant="outline"
            size="xs"
            className="ml-2"
            onClick={onRefresh}
          >
            Retry
          </Button>
        </div>
      ) : null}
    </>
  );
});
