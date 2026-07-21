"use client";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { formatTime } from "@/lib/format-time";
import { useVideoState, useVideoStore } from "@/store/useVideoStore";

export function Timeline() {
  const videoStore = useVideoStore();
  const { currentTime, duration, trimRange } = useVideoState();
  const playheadPosition = duration > 0 ? (currentTime / duration) * 100 : 0;
  const boundedCurrentTime = Math.min(Math.max(currentTime, 0), duration);

  const setTrimStartToCurrent = () => {
    videoStore.setState((previous) => ({
      ...previous,
      trimRange: [
        Math.min(boundedCurrentTime, previous.trimRange[1]),
        previous.trimRange[1],
      ],
    }));
  };

  const setTrimEndToCurrent = () => {
    videoStore.setState((previous) => ({
      ...previous,
      trimRange: [
        previous.trimRange[0],
        Math.max(boundedCurrentTime, previous.trimRange[0]),
      ],
    }));
  };

  return (
    <section className="rounded-lg border bg-card p-4">
      <div className="relative py-4">
        <div className="absolute inset-x-0 top-0 h-full rounded bg-muted" />
        <div
          className="absolute top-0 z-10 h-full w-0.5 bg-primary"
          style={{ left: `${playheadPosition}%` }}
        />
        <Slider
          className="relative z-20"
          value={trimRange}
          min={0}
          max={Math.max(duration, 0.01)}
          step={0.01}
          onValueChange={(value) => {
            const range = Array.isArray(value) ? value : [value, duration];
            videoStore.setState((previous) => ({
              ...previous,
              trimRange: [range[0] ?? 0, range[1] ?? duration],
            }));
          }}
          aria-label="Trim range"
        />
      </div>
      <div className="flex justify-between text-xs tabular-nums text-muted-foreground">
        <span>{formatTime(trimRange[0])}</span>
        <span>{formatTime(trimRange[1])}</span>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={setTrimStartToCurrent}>
          Set Start to Current
        </Button>
        <Button variant="outline" size="sm" onClick={setTrimEndToCurrent}>
          Set End to Current
        </Button>
      </div>
    </section>
  );
}
