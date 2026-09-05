"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatTime } from "@/lib/format-time";
import { MIN_SUBTITLE_DURATION } from "@/lib/subtitles/subtitleDefaults";
import type { Subtitle } from "@/lib/subtitles/subtitleTypes";
import { TrimControls } from "@/components/editor/shared/TrimControls";
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
        <TrimControls
          trimStart={trimStart}
          trimEnd={trimEnd}
          duration={effectiveDuration}
          sliderMax={Math.max(effectiveDuration, 0.01)}
          minGap={MIN_SUBTITLE_DURATION}
          onSetTrimRange={([s, e]) => onTrimChange(s, e)}
          showReadout={false}
          showNumericInputs
        />

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
