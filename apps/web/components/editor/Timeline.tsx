"use client";

import { Button } from "@/components/ui/button";
import { formatTime } from "@/lib/format-time";
import { useVideoState, useVideoStore } from "@/store/useVideoStore";
import { ArrowLeft, ArrowRight, SkipBack, SkipForward } from "lucide-react";
import type { RefObject } from "react";
import { TrimSlider } from "@/components/editor/shared/TrimSlider";
import { useTrimRange } from "@/components/editor/shared/useTrimRange";

interface TimelineProps {
  playerRef: RefObject<HTMLVideoElement | null>;
}

export function Timeline({ playerRef }: TimelineProps) {
  const videoStore = useVideoStore();
  const { currentTime, duration } = useVideoState();
  const boundedCurrentTime = Math.min(Math.max(currentTime, 0), duration);

  // Shared trim-range state: store tuple, init/clamp on duration, raw commits
  // (minGap 0 — zero-length selections allowed, as before).
  const {
    trimRange,
    trimStart,
    trimEnd,
    setTrimRange,
    setStartToCurrentTime,
    setEndToCurrentTime,
  } = useTrimRange({
    duration,
    minGap: 0,
    initClampMargin: 0.01,
    overshoot: "clamp",
  });

  const setTrimStartToCurrent = () => {
    setStartToCurrentTime(boundedCurrentTime);
  };

  const setTrimEndToCurrent = () => {
    setEndToCurrentTime(boundedCurrentTime);
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
      <TrimSlider
        trimStart={trimStart}
        trimEnd={trimEnd}
        duration={duration}
        sliderMax={Math.max(duration, 0.01)}
        step={0.01}
        minGap={0}
        currentTime={currentTime}
        playheadVariant="line"
        sliderClassName="relative z-20"
        wrapperClassName="relative py-4"
        onSetTrimRange={setTrimRange}
      />
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
