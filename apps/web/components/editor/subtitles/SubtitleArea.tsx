"use client";

import { memo } from "react";
import { Captions, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AreaShell } from "@/components/shared/AreaShell";
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
    <AreaShell
      icon={<Captions className="size-3.5" aria-hidden />}
      title="Subtitle area"
      badges={
        <>
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
        </>
      }
      subtitle={
        <>
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
        </>
      }
      actions={
        <>
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
        </>
      }
      readouts={[
        {
          label: "Subtitles / Tracks",
          value: (
            <>
              <div className="mt-0.5 font-mono text-xs tabular-nums">
                {count} · {trackCount} lane{trackCount === 1 ? "" : "s"}
              </div>
              <div className="font-mono text-[11px] tabular-nums text-kumo-subtle">
                layout {layoutMode} · {fileName || "untitled"}
              </div>
            </>
          ),
        },
        {
          label: "Selected",
          value: selected ? (
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
          ),
        },
        {
          label: "Trim",
          value: (
            <>
              <div className="mt-0.5 font-mono text-xs tabular-nums">
                <span suppressHydrationWarning>{trimLabel}</span>
              </div>
              <div className="font-mono text-[11px] tabular-nums text-kumo-subtle">
                <span suppressHydrationWarning>{durationLabel}</span> total
              </div>
            </>
          ),
        },
        {
          label: "Export",
          value: (
            <>
              <div className="mt-0.5 truncate font-mono text-[11px] leading-4 tabular-nums text-kumo-subtle">
                {exportName}
              </div>
              <div className="font-mono text-[11px] tabular-nums text-kumo-subtle">
                mp4 · 1080 × 1920 · burned-in PNGs
              </div>
            </>
          ),
        },
      ]}
      hint={
        selected ? (
          <span>
            Drag timeline blocks to retime · drag vertically to move tracks ·
            style in the sidebar
          </span>
        ) : (
          <span>
            Click a subtitle on the preview or list to edit its style, position
            and timing
          </span>
        )
      }
    />
  );
});
