"use client";

import { memo } from "react";
import { Button } from "@/components/ui/button";
import { DynamicCardProbe } from "./placeholders";
import {
  ensureSweepHelper,
  preloadHeavyCard,
  preloadUploadChunked,
} from "./heavy";
import type { AdminHealthProps } from "./types";
import { cn } from "@/lib/utils";

type AdminHeaderProps = {
  isFetching: boolean;
  jobsLength: number;
  pendingCount: number;
  clearAllPending: boolean;
  clearPendingPending: boolean;
  onRefresh: () => void;
  onClearPending: () => void;
  onClearAll: () => void;
} & AdminHealthProps;

export const AdminHeader = memo(function AdminHeader({
  isFetching,
  jobsLength,
  pendingCount,
  clearAllPending,
  clearPendingPending,
  health,
  healthLoading,
  healthError,
  onRefresh,
  onClearPending,
  onClearAll,
}: AdminHeaderProps) {
  const healthOk = !!health && !healthError;
  const healthDot = healthOk
    ? "bg-emerald-500"
    : healthLoading && !health
      ? "bg-amber-400 animate-pulse"
      : "bg-red-500";
  const healthLabel = healthOk
    ? "API ok"
    : healthLoading && !health
      ? "Checking API…"
      : (healthError ?? "API unreachable");
  // Health queue mirrors GET /transcode/jobs `queue` (same getQueueStats
  // source) but arrives via the lightweight /health probe, so it stays
  // visible even when the jobs list fails to load.
  const healthQueue = health
    ? `workers ${health.queue.active}/${health.queue.maxConcurrent} · queued ${health.queue.queued}/${health.queue.maxQueued}`
    : null;
  const healthMeta = healthOk
    ? [
        health?.ffmpegVersion?.split(",")[0] ?? "ffmpeg unknown",
        health?.diskFreeHuman ? `${health.diskFreeHuman} free` : "disk unknown",
        healthQueue,
      ]
        .filter(Boolean)
        .join(" · ")
    : null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h2 className="text-sm font-semibold">Admin · Jobs</h2>
        <p className="flex items-center gap-1.5 text-xs text-kumo-subtle">
          Inspect and clear transcode jobs.
        </p>
        <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] text-kumo-subtle">
          <span
            className={cn(
              "inline-block size-1.5 shrink-0 rounded-full",
              healthDot,
            )}
            aria-hidden
          />
          <span aria-live="polite" title={healthError ?? undefined}>
            {healthLabel}
          </span>
          {healthMeta ? (
            <span
              className="truncate font-mono text-[11px] tabular-nums"
              title={health?.ffmpegVersion ?? undefined}
            >
              · {healthMeta}
            </span>
          ) : null}
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
