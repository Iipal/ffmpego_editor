"use client";

import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import { formatTime } from "@/lib/format-time";
import { clamp } from "@/lib/mobile-layout";
import { CutBlock } from "./CutBlock";
import type { Cut } from "./types";
import type { ReactNode } from "react";

export function CutTimeline({
  cutsCount,
  outDuration,
  currentTime,
  duration,
  sorted,
  selectedId,
  overlapIds,
  onAddCut,
  onDeleteSelected,
  onSelect,
  onPatchCut,
  children,
}: {
  cutsCount: number;
  outDuration: number;
  currentTime: number;
  duration: number;
  sorted: Cut[];
  selectedId: string | null;
  overlapIds: Set<string>;
  onAddCut: () => void;
  onDeleteSelected: () => void;
  onSelect: (id: string) => void;
  onPatchCut: (id: string, next: Cut) => void;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2 rounded-lg border border-kumo-hairline bg-kumo-recessed/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold">
          Cuts · {cutsCount} · out {formatTime(outDuration)}
        </span>
        <div className="flex gap-1.5">
          <Button
            size="sm"
            variant="secondary"
            onClick={onAddCut}
            className="h-6 rounded-md px-2 text-xs"
          >
            <Plus className="size-3" aria-hidden />
            Cut at {formatTime(currentTime)}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={onDeleteSelected}
            disabled={!selectedId}
            className="h-6 rounded-md px-2 text-xs"
          >
            <Trash2 className="size-3" aria-hidden />
            Delete
          </Button>
        </div>
      </div>
      <div
        data-cut-track
        className="relative h-14 rounded-md border border-kumo-line bg-kumo-base"
      >
        {/* playhead */}
        {duration > 0 ? (
          <div
            className="pointer-events-none absolute top-0 bottom-0 z-10 w-0.5 bg-kumo-strong/70"
            style={{
              left: `${clamp((currentTime / duration) * 100, 0, 100)}%`,
            }}
            aria-hidden
          />
        ) : null}
        {sorted.map((c, i) => (
          <CutBlock
            key={c.id}
            cut={c}
            index={i}
            duration={duration || 1}
            isSelected={c.id === selectedId}
            hasOverlap={overlapIds.has(c.id)}
            onSelect={onSelect}
            onChange={onPatchCut}
          />
        ))}
        {cutsCount === 0 ? (
          <span className="absolute inset-0 flex items-center justify-center text-[11px] text-kumo-subtle">
            No cuts — press “Cut at playhead”, then drag edges to resize by
            length
          </span>
        ) : null}
      </div>
      <div className="flex justify-between text-[10px] tabular-nums text-kumo-subtle">
        <span>0:00</span>
        <span>drag blocks to move · drag edges to resize</span>
        <span>{formatTime(duration)}</span>
      </div>
      {overlapIds.size > 0 ? (
        <p className="text-xs text-kumo-warn">
          Cuts overlap — resize them so they don&apos;t intersect.
        </p>
      ) : null}

      {children}
    </div>
  );
}
