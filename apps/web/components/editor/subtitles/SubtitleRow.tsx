"use client";

import { memo, useCallback, useMemo } from "react";
import { formatTime } from "@/lib/format-time";
import { cn } from "@/lib/utils";
import { getSubtitleTrack } from "./subtitle-helpers";
import type { SubtitleRowProps } from "./types";

export const SubtitleRow = memo(function SubtitleRow({
  sub,
  isSelected,
  isVisible,
  onSelect,
}: SubtitleRowProps) {
  const handleSelect = useCallback(() => onSelect(sub.id), [onSelect, sub.id]);
  const trackLabel = useMemo(() => getSubtitleTrack(sub) + 1, [sub]);
  const fontLabel = useMemo(
    () => sub.style.fontFamily.split(",")[0],
    [sub.style.fontFamily],
  );
  return (
    <button
      onClick={handleSelect}
      className={cn(
        "w-full text-left rounded-lg border p-2.5 space-y-1 transition-colors",
        isSelected
          ? "border-kumo-brand bg-kumo-brand/5"
          : "border-kumo-line bg-kumo-base hover:bg-kumo-recessed/50",
        isVisible && "ring-1 ring-primary/20",
      )}
      aria-label={`Select subtitle ${sub.text}`}
      aria-selected={isSelected}
      style={
        {
          contentVisibility: "auto",
          containIntrinsicSize: "0 90px",
        } as React.CSSProperties
      }
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium line-clamp-2 flex-1">
          {sub.text || "(empty)"}
        </span>
        <span className="flex items-center gap-1 shrink-0">
          <span className="text-[10px] bg-kumo-recessed border px-1 rounded">
            T{trackLabel}
          </span>
          {isVisible ? (
            <span className="text-[10px] bg-kumo-brand text-white px-1 rounded">
              ON
            </span>
          ) : null}
        </span>
      </div>
      <div className="text-[11px] tabular-nums text-kumo-subtle flex gap-2">
        <span suppressHydrationWarning>{formatTime(sub.startTime)}</span>
        <span>–</span>
        <span suppressHydrationWarning>{formatTime(sub.endTime)}</span>
        <span className="ml-auto">
          {(sub.endTime - sub.startTime).toFixed(2)}s
        </span>
      </div>
      <div className="text-[10px] text-kumo-subtle">
        Track {trackLabel} · Pos {sub.position.x.toFixed(0)},{" "}
        {sub.position.y.toFixed(0)} · {fontLabel}
      </div>
    </button>
  );
});
