"use client";

import { memo } from "react";
import { Captions, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AreaShell } from "@/components/shared/AreaShell";
import type { SubtitleAreaProps } from "./types";

// SubtitleArea — slim stage toolbar for subtitles (readout grid removed:
// counts live in the header, selection/trim/export in their own panels).
export const SubtitleArea = memo(function SubtitleArea({
  count,
  trackCount,
  layoutMode,
  selected,
  durationLabel,
  sourceLabel,
  canDelete,
  onAdd,
  onDelete,
}: SubtitleAreaProps) {
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
    />
  );
});
