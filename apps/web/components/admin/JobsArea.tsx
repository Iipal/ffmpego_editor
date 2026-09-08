"use client";

import { memo } from "react";
import { ServerCog, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { JobsAreaProps } from "./types";

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
  queue,
  onRefresh,
}: JobsAreaProps) {
  const queueLabel = queue
    ? `workers ${queue.active}/${queue.maxConcurrent} · queued ${queue.queued}/${queue.maxQueued}`
    : null;
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
          {queueLabel ? ` · ${queueLabel}` : null}
        </span>
      </div>
    </div>
  );
});
