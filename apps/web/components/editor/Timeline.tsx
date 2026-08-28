"use client";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { formatTime } from "@/lib/format-time";
import { useVideoState, useVideoStore } from "@/store/useVideoStore";
import { ArrowLeft, ArrowRight, SkipBack, SkipForward } from "lucide-react";
import type { RefObject } from "react";
import { cn } from "@/lib/utils";

interface TimelineProps {
  playerRef: RefObject<HTMLVideoElement | null>;
}

export function Timeline({ playerRef }: TimelineProps) {
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

  const setPlayerToStart = () => {
    const player = playerRef.current;
    if (!player) return;
    const time = Math.max(trimRange[0], 0);
    player.currentTime = time;
    videoStore.setState((previous) =>
      previous.currentTime === time
        ? previous
        : { ...previous, currentTime: time },
    );
  };

  const setPlayerToEnd = () => {
    const player = playerRef.current;
    if (!player) return;
    const time = Math.min(trimRange[1], duration);
    player.currentTime = time;
    videoStore.setState((previous) =>
      previous.currentTime === time
        ? previous
        : { ...previous, currentTime: time },
    );
  };

  return (
    <section className="enterprise-card rounded-lg p-4">
      <div className="relative py-4">
        <div
          className="absolute top-0 z-10 h-full w-0.5 bg-kumo-brand"
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
      <div className="flex justify-between text-xs tabular-nums text-kumo-subtle">
        <span>{formatTime(trimRange[0])}</span>
        <span>{formatTime(trimRange[1] - trimRange[0])}</span>
        <span>{formatTime(trimRange[1])}</span>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={setTrimStartToCurrent}>
          <ArrowLeft className="mr-2 size-4" />
          Set Start to Current
        </Button>
        <Button variant="outline" size="sm" onClick={setTrimEndToCurrent}>
          <ArrowRight className="mr-2 size-4" />
          Set End to Current
        </Button>
        <Button variant="outline" size="sm" onClick={setPlayerToStart}>
          <SkipBack className="mr-2 size-4" />
          Set Player to Start
        </Button>
        <Button variant="outline" size="sm" onClick={setPlayerToEnd}>
          <SkipForward className="mr-2 size-4" />
          Set Player to End
        </Button>
      </div>
    </section>
  );
}
