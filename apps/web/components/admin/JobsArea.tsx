"use client";

import { memo } from "react";
import { ServerCog } from "lucide-react";
import { cn } from "@/lib/utils";
import { AreaShell } from "@/components/shared/AreaShell";
import { Button } from "@/components/ui/button";
import type { JobsAreaProps } from "./types";

// JobsArea — slim toolbar for transcode jobs (readout grid removed: counts
// live in the Admin header and the Current jobs filter bar). Jobs persist in
// the API SQLite registry and arrive via SSE live sync; Refresh re-fetches
// on demand.
export const JobsArea = memo(function JobsArea({
  total,
  pending,
  filter,
  isFetching,
  liveStatus,
  apiBase,
  onRefresh,
}: JobsAreaProps) {
  return (
    <AreaShell
      className="flex flex-col col-span-full border"
      icon={<ServerCog className="size-3.5" aria-hidden />}
      title="Jobs area"
      badges={
        <>
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
        </>
      }
      subtitle={
        <>
          {total} job{total === 1 ? "" : "s"}
          <span aria-hidden className="mx-1 text-kumo-hairline">
            ·
          </span>
          {pending} pending
          <span aria-hidden className="mx-1 text-kumo-hairline">
            ·
          </span>
          <span className="font-mono text-[11px]">{apiBase}</span>
        </>
      }
      actions={
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
      }
      hint={
        <span>
          Live sync via SSE · Pending = processing + queued · outputs kept
          server-side until deleted · temp inputs /tmp/&lt;uuid&gt;-* · outputs
          /tmp/temp_&lt;jobId&gt;.* on the API
        </span>
      }
    />
  );
});
