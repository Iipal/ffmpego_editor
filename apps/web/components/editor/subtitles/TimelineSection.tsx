"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { formatTime } from "@/lib/format-time";
import { MIN_SUBTITLE_DURATION } from "@/lib/subtitles/subtitleDefaults";
import type { Subtitle } from "@/lib/subtitles/subtitleTypes";
import { MemoTimelineVisual } from "./TimelineVisual";

export type TimelineSectionProps = {
  effectiveDuration: number;
  trimStart: number;
  trimEnd: number;
  onTrimChange: (newStart: number, newEnd: number) => void;
  currentTime: number;
  subtitles: Subtitle[];
  selectedId: string | null;
  trackCount: number;
  onSeek: (t: number) => void;
  onSelect: (id: string) => void;
  onUpdateSubtitle: (id: string, start: number, end: number) => void;
  onUpdateTrack: (id: string, newTrack: number) => void;
  onAddTrack: () => void;
};

export function TimelineSection({
  effectiveDuration,
  trimStart,
  trimEnd,
  onTrimChange,
  currentTime,
  subtitles,
  selectedId,
  trackCount,
  onSeek,
  onSelect,
  onUpdateSubtitle,
  onUpdateTrack,
  onAddTrack,
}: TimelineSectionProps) {
  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-sm">Timeline Editor</CardTitle>
        <p className="text-xs text-kumo-subtle">
          Drag subtitle blocks or edges. Click timeline to seek. Trim defines
          editable region.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border bg-kumo-recessed/20 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold">Trim</span>
            <span
              className="text-[11px] tabular-nums text-kumo-subtle"
              suppressHydrationWarning
            >
              {formatTime(trimStart)} → {formatTime(trimEnd)} ·{" "}
              {formatTime(Math.max(0, trimEnd - trimStart))}
            </span>
          </div>
          <Slider
            value={[trimStart, trimEnd]}
            min={0}
            max={Math.max(effectiveDuration, 0.01)}
            step={0.05}
            onValueChange={(v) => {
              const arr = Array.isArray(v)
                ? (v as number[])
                : [v as number, effectiveDuration];
              const [ns, ne] = arr as [number, number];
              if (ne - ns >= MIN_SUBTITLE_DURATION) onTrimChange(ns, ne);
            }}
            aria-label="Trim range"
          />
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="trim-start" className="text-[11px]">
                Trim Start
              </Label>
              <Input
                id="trim-start"
                type="number"
                step="0.1"
                value={trimStart.toFixed(2)}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (Number.isFinite(v)) onTrimChange(v, trimEnd);
                }}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="trim-end" className="text-[11px]">
                Trim End
              </Label>
              <Input
                id="trim-end"
                type="number"
                step="0.1"
                value={trimEnd.toFixed(2)}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (Number.isFinite(v)) onTrimChange(trimStart, v);
                }}
              />
            </div>
          </div>
        </div>

        <MemoTimelineVisual
          duration={effectiveDuration}
          trimStart={trimStart}
          trimEnd={trimEnd}
          currentTime={currentTime}
          subtitles={subtitles}
          selectedId={selectedId}
          trackCount={trackCount}
          onSeek={onSeek}
          onSelect={onSelect}
          onUpdateSubtitle={onUpdateSubtitle}
          onUpdateTrack={onUpdateTrack}
          onAddTrack={onAddTrack}
        />
        <div className="text-[11px] text-kumo-subtle flex justify-between tabular-nums">
          <span suppressHydrationWarning>0:00</span>
          <span className="flex items-center gap-1">
            <span className="size-2 bg-kumo-brand rounded-sm inline-block" />{" "}
            subtitle
            <span className="size-2 bg-kumo-brand/60 rounded-sm inline-block ml-2" />{" "}
            selected
          </span>
          <span suppressHydrationWarning>
            {formatTime(effectiveDuration)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
