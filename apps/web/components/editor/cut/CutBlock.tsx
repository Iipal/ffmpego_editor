"use client";

import { memo, useCallback, useRef } from "react";
import { formatTime } from "@/lib/format-time";
import { cn } from "@/lib/utils";
import { clamp } from "@/lib/mobile-layout";
import type { Cut } from "./types";

export type CutBlockProps = {
  cut: Cut;
  index: number;
  duration: number;
  isSelected: boolean;
  hasOverlap: boolean;
  onSelect: (id: string) => void;
  onChange: (id: string, next: Cut) => void;
};

export const CutBlock = memo(function CutBlock({
  cut,
  index,
  duration,
  isSelected,
  hasOverlap,
  onSelect,
  onChange,
}: CutBlockProps) {
  const left = duration > 0 ? (cut.start / duration) * 100 : 0;
  const width =
    duration > 0 ? Math.max(1.5, ((cut.end - cut.start) / duration) * 100) : 0;

  const dragState = useRef<{
    kind: "move" | "l" | "r";
    startX: number;
    orig: Cut;
    trackW: number;
  } | null>(null);

  const onPointerDown = useCallback(
    (kind: "move" | "l" | "r") => (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onSelect(cut.id);
      const track = (e.currentTarget as HTMLElement).closest(
        "[data-cut-track]",
      ) as HTMLElement | null;
      const trackW = track?.getBoundingClientRect().width ?? 1;
      dragState.current = {
        kind,
        startX: e.clientX,
        orig: { ...cut },
        trackW,
      };
      const move = (ev: PointerEvent) => {
        const st = dragState.current;
        if (!st) return;
        const dt = ((ev.clientX - st.startX) / st.trackW) * duration;
        const o = st.orig;
        const minLen = 0.2;
        if (st.kind === "l") {
          const ns = clamp(o.start + dt, 0, o.end - minLen);
          onChange(cut.id, { ...o, start: Math.round(ns * 100) / 100 });
        } else if (st.kind === "r") {
          const ne = clamp(o.end + dt, o.start + minLen, duration);
          onChange(cut.id, { ...o, end: Math.round(ne * 100) / 100 });
        } else {
          const len = o.end - o.start;
          const ns = clamp(o.start + dt, 0, Math.max(0, duration - len));
          onChange(cut.id, {
            ...o,
            start: Math.round(ns * 100) / 100,
            end: Math.round((ns + len) * 100) / 100,
          });
        }
      };
      const up = () => {
        dragState.current = null;
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [cut, duration, onChange, onSelect],
  );

  return (
    <div
      onPointerDown={onPointerDown("move")}
      onClick={() => onSelect(cut.id)}
      role="button"
      tabIndex={0}
      aria-label={`Cut ${index + 1} ${formatTime(cut.start)} to ${formatTime(cut.end)}`}
      className={cn(
        "absolute top-1 bottom-1 flex cursor-grab items-stretch overflow-hidden rounded-md border text-[10px] font-medium tabular-nums select-none touch-none active:cursor-grabbing",
        isSelected
          ? "border-kumo-brand bg-kumo-brand/15 shadow-[0_0_0_1px_var(--kumo-brand)]"
          : "border-kumo-line bg-kumo-brand/8 hover:bg-kumo-brand/12",
        hasOverlap && "border-kumo-warn bg-kumo-warn/10",
      )}
      style={{ left: `${left}%`, width: `${width}%` }}
    >
      <div
        onPointerDown={onPointerDown("l")}
        className="w-2 shrink-0 cursor-ew-resize bg-kumo-brand/25 hover:bg-kumo-brand/50"
        aria-hidden
      />
      <span className="flex flex-1 items-center justify-center truncate px-1 text-kumo-strong">
        C{index + 1} · {(cut.end - cut.start).toFixed(1)}s
      </span>
      <div
        onPointerDown={onPointerDown("r")}
        className="w-2 shrink-0 cursor-ew-resize bg-kumo-brand/25 hover:bg-kumo-brand/50"
        aria-hidden
      />
    </div>
  );
});
