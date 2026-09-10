"use client";

import { memo } from "react";
import { HardDrive, ServerCog, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { videoFileService } from "@/lib/video-file";
import type { JobsAreaProps } from "./types";

// Warn when the managed store approaches quota — past this point new exports
// fail with 507 QUOTA_EXCEEDED/DISK_FULL, so the dashboard must say so before
// the user queues more work.
const STORAGE_WARN_PCT = 90;

// JobsArea — CropArea-style control & readout surface for transcode jobs
// Mirrors pageEditorCrop CropArea: one authoritative bar (top bar + readout
// grid + hint). Readouts are derived, never stored. Jobs persist in the API
// SQLite registry and arrive via SSE live sync; Refresh re-fetches on demand.
export const JobsArea = memo(function JobsArea({
  total,
  pending,
  completed,
  failed,
  filter,
  isStale,
  isFetching,
  liveStatus,
  apiBase,
  onRefresh,
  storage,
  storageLoading,
  storageError,
  sweepPending,
  onSweep,
}: JobsAreaProps) {
  const quotaBytes = storage?.quotaBytes ?? 0;
  const usedBytes = storage?.bytes ?? 0;
  const usedPct =
    storage && quotaBytes > 0
      ? Math.min(100, (usedBytes / quotaBytes) * 100)
      : 0;
  const storageFull = usedPct >= STORAGE_WARN_PCT;
  const assetCount = storage?.byRole.asset ?? 0;
  const artifactCount = storage?.byRole.artifact ?? 0;
  return (
    <div className="rounded-md border border-kumo-hairline bg-kumo-recessed">
      {/* Top bar: identity + actions */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="inline-flex size-7 items-center justify-center rounded-md border border-kumo-line bg-kumo-base text-kumo-subtle">
            <ServerCog className="size-3.5" aria-hidden />
          </span>
          <div className="flex flex-col gap-0.5">
            <span className="flex items-center gap-2 text-xs font-semibold leading-none">
              Jobs area
              <span className="inline-flex items-center rounded-full border border-kumo-hairline bg-kumo-base px-1.5 py-0.5 text-[10px] font-medium leading-none tabular-nums text-kumo-subtle">
                filter: {filter}
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] font-normal text-kumo-subtle">
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    liveStatus === "live"
                      ? "bg-kumo-success"
                      : liveStatus === "error"
                        ? "bg-red-500"
                        : "bg-kumo-brand animate-pulse",
                  )}
                  aria-hidden
                />
                {liveStatus === "live"
                  ? "live"
                  : liveStatus === "error"
                    ? "stream unavailable"
                    : "connecting…"}
              </span>
            </span>
            <span className="text-[11px] leading-none text-kumo-subtle tabular-nums">
              {total} job{total === 1 ? "" : "s"}
              <span aria-hidden className="mx-1 text-kumo-hairline">
                ·
              </span>
              {pending} pending
              <span aria-hidden className="mx-1 text-kumo-hairline">
                ·
              </span>
              <span className="font-mono text-[11px]">{apiBase}</span>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="secondary"
            onClick={onRefresh}
            disabled={isFetching}
            className="h-7 rounded-md text-xs"
            title="Re-fetch jobs now"
            aria-label="Refresh jobs"
          >
            {isFetching ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
      </div>

      {/* Readout grid: total + pending + completed + failed */}
      <div className="grid grid-cols-2 gap-px border-t border-kumo-hairline bg-kumo-hairline sm:grid-cols-4">
        <div className="bg-kumo-recessed px-3 py-2">
          <div className="text-[10px] font-medium uppercase tracking-wide text-kumo-subtle">
            Total
          </div>
          <div className="mt-0.5 font-mono text-xs tabular-nums">{total}</div>
          <div className="font-mono text-[11px] tabular-nums text-kumo-subtle">
            SQLite · survives restart
          </div>
        </div>
        <div className="bg-kumo-recessed px-3 py-2">
          <div className="text-[10px] font-medium uppercase tracking-wide text-kumo-subtle">
            Pending
          </div>
          <div className="mt-0.5 font-mono text-xs tabular-nums">{pending}</div>
          <div className="font-mono text-[11px] tabular-nums text-kumo-subtle">
            processing + queued
          </div>
        </div>
        <div className="bg-kumo-recessed px-3 py-2">
          <div className="text-[10px] font-medium uppercase tracking-wide text-kumo-subtle">
            Completed
          </div>
          <div className="mt-0.5 font-mono text-xs tabular-nums">
            {completed}
          </div>
          <div className="font-mono text-[11px] tabular-nums text-kumo-subtle">
            kept until deleted
          </div>
        </div>
        <div className="bg-kumo-recessed px-3 py-2">
          <div className="text-[10px] font-medium uppercase tracking-wide text-kumo-subtle">
            Failed
          </div>
          <div
            className={cn(
              "mt-0.5 font-mono text-xs tabular-nums",
              failed > 0 && "text-kumo-warn",
            )}
          >
            {failed}
          </div>
          <div className="font-mono text-[11px] tabular-nums text-kumo-subtle">
            {isStale ? "updating…" : "see error rows"}
          </div>
        </div>
      </div>

      {/* Hint — operational, not decorative */}
      <div className="flex items-center gap-1.5 border-t border-kumo-hairline px-3 py-2 text-[11px] leading-none text-kumo-subtle">
        <SlidersHorizontal className="size-3 shrink-0" aria-hidden />
        <span>
          Live sync via SSE · Pending = processing + queued · outputs kept
          server-side until deleted · temp inputs /tmp/&lt;uuid&gt;-* · outputs
          /tmp/temp_&lt;jobId&gt;.* on the API
        </span>
      </div>

      {/* Storage — quota census + on-demand sweep */}
      <div className="border-t border-kumo-hairline px-3 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-kumo-subtle">
            <HardDrive className="size-3 shrink-0" aria-hidden />
            Storage
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={onSweep}
            disabled={sweepPending || storageLoading}
            className="h-7 rounded-md text-xs"
            title="Reap expired, stale and orphan store records (live jobs are never touched)"
            aria-label="Sweep expired store files"
          >
            {sweepPending ? "Sweeping…" : "Sweep"}
          </Button>
        </div>

        {storage ? (
          <div className="mt-2">
            <Progress
              value={usedPct}
              aria-label={`Storage ${usedPct.toFixed(0)} percent used`}
            />
            <div className="mt-1 flex flex-wrap items-baseline gap-x-2 text-[11px] leading-none tabular-nums">
              <span
                className={cn(
                  "font-mono font-medium",
                  storageFull ? "text-kumo-warn" : "text-kumo-subtle",
                )}
              >
                {videoFileService.formatFileSize(usedBytes)} of{" "}
                {videoFileService.formatFileSize(quotaBytes)} (
                {usedPct.toFixed(0)}%)
              </span>
              <span className="font-mono text-kumo-subtle">
                {storage.files} file{storage.files === 1 ? "" : "s"}
              </span>
              <span aria-hidden className="text-kumo-hairline">
                ·
              </span>
              <span className="font-mono text-kumo-subtle">
                {assetCount} asset{assetCount === 1 ? "" : "s"}
              </span>
              <span aria-hidden className="text-kumo-hairline">
                ·
              </span>
              <span className="font-mono text-kumo-subtle">
                {artifactCount} artifact{artifactCount === 1 ? "" : "s"}
              </span>
            </div>
            {storageFull && (
              <p className="mt-1 text-[11px] leading-snug text-kumo-warn" role="alert">
                Quota nearly full — new exports fail with 507
                QUOTA_EXCEEDED/DISK_FULL. Sweep or delete jobs to free space.
              </p>
            )}
          </div>
        ) : storageError ? (
          <p className="mt-2 text-[11px] leading-snug text-red-500">
            Storage stats unavailable: {storageError}
          </p>
        ) : (
          <p className="mt-2 text-[11px] leading-none text-kumo-subtle">
            {storageLoading === false ? "No storage data." : "Checking storage…"}
          </p>
        )}
      </div>
    </div>
  );
});
