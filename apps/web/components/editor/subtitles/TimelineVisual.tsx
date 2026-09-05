"use client";

import { memo, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { clamp } from "@/lib/mobile-layout";
import { formatTime } from "@/lib/format-time";
import { cn } from "@/lib/utils";
import { getSubtitleTrack } from "./subtitle-helpers";
import { useTimelineDrag } from "./useTimelineDrag";
import type { TimelineVisualProps } from "./types";

const ROW_H = 32;
const HEADER_H = 22;

export function TimelineVisual({
  duration,
  trimStart,
  trimEnd,
  currentTime,
  subtitles,
  selectedId,
  trackCount,
  onSeek,
  onSelect,
  onUpdateSubtitle,
  onUpdateTrack,
  onAddTrack,
}: TimelineVisualProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const { setDrag, toTime } = useTimelineDrag({
    trackRef,
    duration,
    trimStart,
    trimEnd,
    trackCount,
    rowHeight: ROW_H,
    onUpdateSubtitle,
    onUpdateTrack,
  });

  const onPointerDownTrack = useCallback(
    (e: React.PointerEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.dataset.role === "track" ||
        target.dataset.role === "track-bg" ||
        target.dataset.role === "track-row"
      ) {
        const t = toTime(e.clientX);
        onSeek(t);
      }
    },
    [toTime, onSeek],
  );

  // js-cache-property-access: cache duration check
  const durationPositive = duration > 0;
  const playheadPct = durationPositive
    ? clamp((currentTime / duration) * 100, 0, 100)
    : 0;
  const trimLeftPct = durationPositive ? (trimStart / duration) * 100 : 0;
  const trimWidthPct = durationPositive
    ? ((trimEnd - trimStart) / duration) * 100
    : 100;
  const totalHeight = HEADER_H + trackCount * ROW_H;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold">
          Tracks · {trackCount} {trackCount === 1 ? "lane" : "lanes"}
        </span>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-kumo-subtle hidden sm:inline">
            Drag vertically to move between tracks
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={onAddTrack}
            aria-label="Add Track"
          >
            + Add Track
          </Button>
        </div>
      </div>
      <div
        ref={trackRef}
        data-role="track"
        onPointerDown={onPointerDownTrack}
        className="relative rounded-lg border bg-kumo-recessed/30 overflow-hidden select-none"
        style={{ height: totalHeight }}
        aria-label="Subtitle timeline with tracks"
      >
        <div
          className="absolute bg-kumo-brand/10 border-x border-kumo-brand/20"
          style={{
            left: `${trimLeftPct}%`,
            width: `${trimWidthPct}%`,
            top: HEADER_H,
            bottom: 0,
          }}
          data-role="track-bg"
        />
        <div
          className="absolute left-0 right-0 flex justify-between px-2 pt-1 pointer-events-none border-b border-kumo-line/40 bg-kumo-recessed/20"
          style={{ height: HEADER_H, top: 0 }}
        >
          <span
            className="text-[9px] text-kumo-subtle tabular-nums"
            suppressHydrationWarning
          >
            {formatTime(trimStart)}
          </span>
          <span
            className="text-[9px] text-kumo-subtle tabular-nums"
            suppressHydrationWarning
          >
            {formatTime(trimEnd)}
          </span>
        </div>
        {Array.from({ length: trackCount }).map((_, ti) => (
          <div
            key={ti}
            data-role="track-row"
            data-track={ti}
            className={cn(
              "absolute left-0 right-0 border-b border-kumo-line/30 flex items-center",
              ti % 2 === 0 ? "bg-kumo-base/40" : "bg-kumo-recessed/10",
            )}
            style={{ top: HEADER_H + ti * ROW_H, height: ROW_H }}
          >
            <span className="absolute left-1.5 text-[9px] font-medium text-kumo-subtle tabular-nums w-10 select-none">
              Track {ti + 1}
            </span>
            <div className="absolute left-12 right-1 top-0 bottom-0 border-l border-dashed border-kumo-line/20" />
          </div>
        ))}
        {subtitles.map((sub) => {
          const left = durationPositive ? (sub.startTime / duration) * 100 : 0;
          const width = durationPositive
            ? ((sub.endTime - sub.startTime) / duration) * 100
            : 0;
          const isSelected = sub.id === selectedId;
          const isActive =
            currentTime >= sub.startTime && currentTime < sub.endTime;
          const trackIdx = getSubtitleTrack(sub);
          const clampedTrack = clamp(trackIdx, 0, Math.max(trackCount - 1, 0));
          const top = HEADER_H + clampedTrack * ROW_H + 3;
          return (
            <div
              key={sub.id}
              className={cn(
                "absolute rounded border flex items-center overflow-hidden group",
                isSelected
                  ? "bg-kumo-brand text-white border-kumo-brand z-10 shadow"
                  : "bg-kumo-base border-kumo-line hover:border-kumo-brand/40",
                isActive && !isSelected && "ring-1 ring-primary/30",
              )}
              style={{
                left: `${left}%`,
                width: `${Math.max(width, 0.8)}%`,
                top,
                height: ROW_H - 6,
              }}
              onPointerDown={(e) => {
                e.stopPropagation();
                onSelect(sub.id);
              }}
              onClick={() => onSelect(sub.id)}
              role="button"
              aria-label={`Subtitle ${sub.text} track ${clampedTrack + 1} ${formatTime(sub.startTime)} to ${formatTime(sub.endTime)}`}
              aria-selected={isSelected}
              title={`Track ${clampedTrack + 1} · drag vertically to move`}
            >
              <div
                className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize bg-black/10 hover:bg-kumo-brand/30 flex items-center justify-center"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onSelect(sub.id);
                  setDrag({
                    id: sub.id,
                    mode: "left",
                    startX: e.clientX,
                    startY: e.clientY,
                    origStart: sub.startTime,
                    origEnd: sub.endTime,
                    origTrack: clampedTrack,
                  });
                }}
                aria-label="Drag to change start time"
              >
                <span className="w-0.5 h-4 bg-white/60 rounded" />
              </div>
              <div
                className="flex-1 px-3 text-[10px] truncate cursor-grab active:cursor-grabbing select-none flex items-center gap-1"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onSelect(sub.id);
                  setDrag({
                    id: sub.id,
                    mode: "move",
                    startX: e.clientX,
                    startY: e.clientY,
                    origStart: sub.startTime,
                    origEnd: sub.endTime,
                    origTrack: clampedTrack,
                  });
                }}
              >
                <span className="text-[8px] opacity-70">↕</span>
                <span className="truncate">{sub.text || "…"}</span>
              </div>
              <div
                className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize bg-black/10 hover:bg-kumo-brand/30 flex items-center justify-center"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onSelect(sub.id);
                  setDrag({
                    id: sub.id,
                    mode: "right",
                    startX: e.clientX,
                    startY: e.clientY,
                    origStart: sub.startTime,
                    origEnd: sub.endTime,
                    origTrack: clampedTrack,
                  });
                }}
                aria-label="Drag to change end time"
              >
                <span className="w-0.5 h-4 bg-white/60 rounded" />
              </div>
            </div>
          );
        })}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-kumo-brand z-20 pointer-events-none"
          style={{ left: `${playheadPct}%` }}
          aria-hidden
        >
          <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 size-2.5 bg-kumo-brand rotate-45 border border-white shadow" />
          <div
            className="absolute bottom-0 left-1/2 -translate-x-1/2 text-[9px] bg-kumo-brand text-white px-1 rounded translate-y-0 tabular-nums"
            suppressHydrationWarning
          >
            {formatTime(currentTime)}
          </div>
        </div>
      </div>
      <div className="flex justify-between text-[10px] tabular-nums text-kumo-subtle">
        <span suppressHydrationWarning>Trim Start {formatTime(trimStart)}</span>
        <span suppressHydrationWarning>Playhead {formatTime(currentTime)}</span>
        <span suppressHydrationWarning>Trim End {formatTime(trimEnd)}</span>
      </div>
    </div>
  );
}

export const MemoTimelineVisual = memo(TimelineVisual);
