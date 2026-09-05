"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatTime } from "@/lib/format-time";
import type { Subtitle } from "@/lib/subtitles/subtitleTypes";
import { EmptySubtitleListPlaceholder } from "./placeholders";
import { SubtitleRow } from "./SubtitleRow";

export type SubtitleListPanelProps = {
  hasVideo: boolean;
  effectiveDuration: number;
  currentTime: number;
  sortedSubtitles: Subtitle[];
  selectedId: string | null;
  isStale: boolean;
  onAdd: () => void;
  onSelect: (id: string) => void;
};

export function SubtitleListPanel({
  hasVideo,
  effectiveDuration,
  currentTime,
  sortedSubtitles,
  selectedId,
  isStale,
  onAdd,
  onSelect,
}: SubtitleListPanelProps) {
  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-sm">Subtitles</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button
          className="w-full"
          onClick={onAdd}
          aria-label="Add Subtitle"
          disabled={!hasVideo || effectiveDuration === 0}
        >
          <span suppressHydrationWarning>
            + Add Subtitle at {formatTime(currentTime)}
          </span>
        </Button>
        <p className="text-[11px] text-kumo-subtle">
          New subtitle starts at current time, lasts 1s (clamped to Trim End).
        </p>
        <div
          className="space-y-2 max-h-80 overflow-auto pr-1"
          style={isStale ? { opacity: 0.7 } : undefined}
        >
          {sortedSubtitles.length === 0 ? EmptySubtitleListPlaceholder : null}
          {sortedSubtitles.map((sub) => (
            <SubtitleRow
              key={sub.id}
              sub={sub}
              isSelected={sub.id === selectedId}
              isVisible={
                currentTime >= sub.startTime && currentTime < sub.endTime
              }
              onSelect={onSelect}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
