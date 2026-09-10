"use client";

import { Button } from "@/components/ui/button";
import { Film, Scissors } from "lucide-react";
import { formatTime } from "@/lib/format-time";
import {
  UploadOtherButton as SharedUploadOtherButton,
  type VideoReset,
} from "../shared/UploadOtherButton";

const cutReset: VideoReset = (): ReturnType<VideoReset> => ({
  source: {
    currentTime: 0,
    duration: 0,
    isPlaying: false,
    sourceWidth: 0,
    sourceHeight: 0,
  },
});

export function CutHeader({
  fileName,
  modeBadge,
  cutsCount,
  outDuration,
  currentTime,
  duration,
  overlapCount,
  activeExports,
  onClear,
  onExport,
}: {
  fileName: string;
  modeBadge: string;
  cutsCount: number;
  outDuration: number;
  currentTime: number;
  duration: number;
  overlapCount: number;
  activeExports: number;
  onClear: () => void;
  onExport: () => void;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-kumo-hairline pb-4">
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold leading-none tracking-normal">
            Cut editor
          </h2>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-kumo-hairline bg-kumo-recessed px-2 py-0.5 text-[11px] font-medium leading-none text-kumo-subtle">
            <Scissors className="size-3" aria-hidden />
            {modeBadge}
            <span aria-hidden className="opacity-40">
              ·
            </span>
            <span className="tabular-nums">
              {cutsCount} cut(s) · {formatTime(outDuration)}
            </span>
          </span>
        </div>
        <p className="flex flex-wrap items-center gap-1.5 text-xs leading-4 text-kumo-subtle">
          <span
            className="min-w-0 max-w-64 truncate font-mono text-[11px] tabular-nums"
            title={fileName}
          >
            {fileName || "untitled"}
          </span>
          <span aria-hidden className="text-kumo-hairline">
            ·
          </span>
          <span className="tabular-nums">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 justify-end">
        <SharedUploadOtherButton reset={cutReset} clearInputAfterPick />
        <span aria-hidden className="h-5 w-px bg-kumo-hairline mx-0.5" />
        <Button
          size="sm"
          variant="secondary"
          onClick={onClear}
          className="h-7 rounded-md text-xs"
        >
          Clear cuts
        </Button>
        <Button
          size="sm"
          onClick={onExport}
          disabled={cutsCount === 0 || overlapCount > 0}
          className="h-7 rounded-md text-xs font-medium"
        >
          <Film className="size-3.5" aria-hidden />
          {activeExports > 0
            ? `Export ${cutsCount} cut(s) (+${activeExports} queued)`
            : `Export ${cutsCount} cut(s)`}
        </Button>
      </div>
    </header>
  );
}
