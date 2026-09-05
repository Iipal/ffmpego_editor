"use client";

import { memo } from "react";
import { Captions, Plus, SlidersHorizontal, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatTime } from "@/lib/format-time";
import { getSubtitleTrack } from "./subtitle-helpers";
import type { SubtitleAreaProps } from "./types";

// SubtitleArea — CropArea-style control & readout surface for subtitles.
// Mirrors pageEditorCrop CropArea: one authoritative bar (top bar + readout
// grid + hint). Readouts are derived, never stored.
export const SubtitleArea = memo(function SubtitleArea({
  count,
  trackCount,
  layoutMode,
  selected,
  trimLabel,
  durationLabel,
  fileName,
  sourceLabel,
  exportName,
  canDelete,
  onAdd,
  onDelete,
}: SubtitleAreaProps) {
  const selectedTrack = selected ? getSubtitleTrack(selected) + 1 : null;

  return (
    <div className="rounded-md border border-kumo-hairline bg-kumo-recessed">
      {/* Top bar: identity + actions */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="inline-flex size-7 items-center justify-center rounded-md border border-kumo-line bg-kumo-base text-kumo-subtle">
            <Captions className="size-3.5" aria-hidden />
          </span>
          <div className="flex flex-col gap-0.5">
            <span className="flex items-center gap-2 text-xs font-semibold leading-none">
              Subtitle area
              <span className="inline-flex items-center rounded-full border border-kumo-hairline bg-kumo-base px-1.5 py-0.5 text-[10px] font-medium leading-none tabular-nums text-kumo-subtle">
                {layoutMode}
              </span>
              {selected ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-normal text-kumo-success">
                  <span
                    className="size-1.5 rounded-full bg-kumo-success"
                    aria-hidden
                  />
                  editing
                </span>
              ) : null}
            </span>
            <span className="text-[11px] leading-none text-kumo-subtle tabular-nums">
              {count} subtitle{count === 1 ? "" : "s"}
              <span aria-hidden className="mx-1 text-kumo-hairline">
                ·
              </span>
              {trackCount} track{trackCount === 1 ? "" : "s"}
              <span aria-hidden className="mx-1 text-kumo-hairline">
                ·
              </span>
              {durationLabel}
              <span aria-hidden className="mx-1 text-kumo-hairline">
                ·
              </span>
              source {sourceLabel}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="secondary"
            onClick={onAdd}
            className="h-7 gap-1.5 rounded-md text-xs"
            title="Add subtitle at playhead"
            aria-label="Add subtitle at playhead"
          >
            <Plus className="size-3.5" aria-hidden />
            Add subtitle
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onDelete}
            disabled={!canDelete}
            className="h-7 gap-1.5 rounded-md text-xs"
            title="Delete selected subtitle"
            aria-label="Delete selected subtitle"
          >
            <Trash2 className="size-3.5" aria-hidden />
            Delete
          </Button>
        </div>
      </div>

      {/* Readout grid: count + selected + trim + export */}
      <div className="grid grid-cols-2 gap-px border-t border-kumo-hairline bg-kumo-hairline sm:grid-cols-4">
        <div className="bg-kumo-recessed px-3 py-2">
          <div className="text-[10px] font-medium uppercase tracking-wide text-kumo-subtle">
            Subtitles / Tracks
          </div>
          <div className="mt-0.5 font-mono text-xs tabular-nums">
            {count} · {trackCount} lane{trackCount === 1 ? "" : "s"}
          </div>
          <div className="font-mono text-[11px] tabular-nums text-kumo-subtle">
            layout {layoutMode} · {fileName || "untitled"}
          </div>
        </div>
        <div className="bg-kumo-recessed px-3 py-2">
          <div className="text-[10px] font-medium uppercase tracking-wide text-kumo-subtle">
            Selected
          </div>
          {selected ? (
            <>
              <div className="mt-0.5 truncate font-mono text-xs tabular-nums">
                {selected.text || "(empty)"}
              </div>
              <div className="font-mono text-[11px] tabular-nums text-kumo-subtle">
                <span suppressHydrationWarning>
                  {formatTime(selected.startTime)} →{" "}
                  {formatTime(selected.endTime)}
                </span>{" "}
                · T{selectedTrack} · {selected.position.x.toFixed(0)},{" "}
                {selected.position.y.toFixed(0)}
              </div>
            </>
          ) : (
            <>
              <div className="mt-0.5 font-mono text-xs tabular-nums text-kumo-subtle">
                —
              </div>
              <div className="font-mono text-[11px] tabular-nums text-kumo-subtle">
                click a subtitle to edit
              </div>
            </>
          )}
        </div>
        <div className="bg-kumo-recessed px-3 py-2">
          <div className="text-[10px] font-medium uppercase tracking-wide text-kumo-subtle">
            Trim
          </div>
          <div className="mt-0.5 font-mono text-xs tabular-nums">
            <span suppressHydrationWarning>{trimLabel}</span>
          </div>
          <div className="font-mono text-[11px] tabular-nums text-kumo-subtle">
            <span suppressHydrationWarning>{durationLabel}</span> total
          </div>
        </div>
        <div className="bg-kumo-recessed px-3 py-2">
          <div className="text-[10px] font-medium uppercase tracking-wide text-kumo-subtle">
            Export
          </div>
          <div className="mt-0.5 truncate font-mono text-[11px] leading-4 tabular-nums text-kumo-subtle">
            {exportName}
          </div>
          <div className="font-mono text-[11px] tabular-nums text-kumo-subtle">
            mp4 · 1080 × 1920 · burned-in PNGs
          </div>
        </div>
      </div>

      {/* Hint — operational, not decorative */}
      <div className="flex items-center gap-1.5 border-t border-kumo-hairline px-3 py-2 text-[11px] leading-none text-kumo-subtle">
        <SlidersHorizontal className="size-3 shrink-0" aria-hidden />
        {selected ? (
          <span>
            Drag timeline blocks to retime · drag vertically to move tracks ·
            style in the sidebar
          </span>
        ) : (
          <span>
            Click a subtitle on the preview or list to edit its style, position
            and timing
          </span>
        )}
      </div>
    </div>
  );
});
