"use client";

import { memo } from "react";
import { Button } from "@/components/ui/button";
import { DynamicCardProbe } from "./placeholders";
import {
  ensureSweepHelper,
  preloadHeavyCard,
  preloadUploadChunked,
} from "./heavy";
import type { LiveStatus } from "./useJobsLiveSync";

const LIVE_DOT: Record<LiveStatus, string> = {
  live: "bg-emerald-500",
  connecting: "bg-amber-400 animate-pulse",
  reconnecting: "bg-amber-400 animate-pulse",
  error: "bg-red-500",
};

const LIVE_LABEL: Record<LiveStatus, string> = {
  live: "Live",
  connecting: "Connecting…",
  reconnecting: "Reconnecting…",
  error: "Stream unavailable — showing last snapshot",
};

type AdminHeaderProps = {
  isFilterStale: boolean;
  isFetching: boolean;
  liveStatus: LiveStatus;
  jobsLength: number;
  pendingCount: number;
  clearAllPending: boolean;
  clearPendingPending: boolean;
  onRefresh: () => void;
  onClearPending: () => void;
  onClearAll: () => void;
};

export const AdminHeader = memo(function AdminHeader({
  isFilterStale,
  isFetching,
  liveStatus,
  jobsLength,
  pendingCount,
  clearAllPending,
  clearPendingPending,
  onRefresh,
  onClearPending,
  onClearAll,
}: AdminHeaderProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h2 className="text-sm font-semibold">Admin · Jobs</h2>
        <p className="flex items-center gap-1.5 text-xs text-kumo-subtle">
          Inspect and clear transcode jobs.
          <span
            className={`inline-block size-1.5 rounded-full ${LIVE_DOT[liveStatus]}`}
            aria-hidden
          />
          <span aria-live="polite">{LIVE_LABEL[liveStatus]}</span>
          {isFilterStale ? "· updating…" : null}
        </p>
        {/* keep probe for analyzable path coverage */}
        {DynamicCardProbe}
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={isFetching}
          onMouseEnter={preloadHeavyCard}
        >
          {isFetching ? "Refreshing…" : "Refresh"}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={onClearPending}
          disabled={clearPendingPending || pendingCount === 0}
          title={
            pendingCount === 0
              ? "No pending jobs"
              : `Clear ${pendingCount} pending`
          }
          onMouseEnter={preloadUploadChunked}
          onFocus={preloadUploadChunked}
        >
          {clearPendingPending
            ? "Clearing…"
            : `Clear pending (${pendingCount})`}
        </Button>
        <Button
          variant="destructive"
          size="sm"
          onClick={onClearAll}
          disabled={clearAllPending || jobsLength === 0}
          onMouseEnter={ensureSweepHelper}
          onFocus={ensureSweepHelper}
        >
          {clearAllPending ? "Clearing…" : `Clear all (${jobsLength})`}
        </Button>
      </div>
    </div>
  );
});
