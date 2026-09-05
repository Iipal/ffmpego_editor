"use client";

import { memo } from "react";
import { Button } from "@/components/ui/button";
import { API_BASE_URL } from "@/lib/api-client";
import { FILTER_OPTIONS, type Filter } from "./types";

type FilterBarProps = {
  deferredFilter: string;
  isFilterStale: boolean;
  isFetching: boolean;
  isPendingTransition: boolean;
  jobsLength: number;
  pendingCount: number;
  pollTick: number;
  isError: boolean;
  error: Error | null;
  onSelect: (f: Filter) => void;
  onRefresh: () => void;
};

export const FilterBar = memo(function FilterBar({
  deferredFilter,
  isFilterStale,
  isFetching,
  isPendingTransition,
  jobsLength,
  pendingCount,
  pollTick,
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
          API: {API_BASE_URL}/api/transcode/jobs
        </span>
      </div>
      <div
        className="text-[10px] font-mono text-kumo-subtle"
        suppressHydrationWarning
      >
        Storage: in-memory Map (apps/api/src/routes/video.ts:49) · temp input
        /tmp/&lt;uuid&gt;-* · output ./temp_&lt;uuid&gt;.* (apps/api). Lost on
        restart. {isFetching ? "· live polling…" : null}{" "}
        {isPendingTransition ? "· updating filter…" : null} · jobs: {jobsLength}{" "}
        · pending: {pendingCount} · tick: {pollTick}
      </div>
      {isError ? (
        <div className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
          {(error as Error).message} — check API at {API_BASE_URL} is running
          & CORS allowed.
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
