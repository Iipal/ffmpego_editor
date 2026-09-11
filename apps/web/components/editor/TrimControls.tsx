"use client";

import { useCallback } from "react";
import type { RefObject } from "react";
import { useSelector } from "@tanstack/react-store";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { SkipBack, SkipForward } from "lucide-react";
import { sourceStore } from "@/store/sourceSlice";
import { usePlayheadTime } from "@/store/playheadSlice";
import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/format-time";
import { seekVideoElement } from "@/components/editor/shared/usePlaybackEngine";
import {
  TRIM_MIN_GAP_DEFAULT,
  useTrimRange,
} from "@/components/editor/shared/useTrimRange";
import { TrimSlider } from "@/components/editor/shared/TrimSlider";

export type TrimControlsProps = {
  /** Full media duration. Defaults to the source-store duration. */
  duration?: number;
  /** Minimum allowed trim length. */
  minGap?: number;
  /** Margin used when clamping an overshooting start back from duration. */
  initClampMargin?: number;
  /** What to do when trimEnd overshoots duration: "reset" or "clamp". */
  overshoot?: "reset" | "clamp";
  /** Extra side-effect after a committed range change (e.g. retime subtitles). */
  onTrimChange?: (start: number, end: number) => void;
  /** Dims + disables the surface (e.g. ignoreTrim). */
  disabled?: boolean;
  /** Slider max override. Defaults to duration || TRIM_SLIDER_MAX_FALLBACK. */
  sliderMax?: number;
  /** Element the "Set Player to Start/End" buttons seek. */
  playerRef: RefObject<HTMLVideoElement | null>;
};

// Self-owned trim card: owns the source-store trimRange tuple via
// useTrimRange and renders the fixed trim editor inside a Card with a
// whole-panel Collapsible — same pattern as AudioControls. Identical view
// on every page: readout, Set Start/End to Current Player Time, Set Player
// to Start/End, dual trim slider. Pages render it as a sibling of
// <AudioControls /> and pass only functional config + their player element.
export function TrimControls({
  duration: durationProp,
  minGap = TRIM_MIN_GAP_DEFAULT,
  initClampMargin,
  overshoot = "clamp",
  onTrimChange,
  disabled = false,
  sliderMax,
  playerRef,
}: TrimControlsProps) {
  const { file, duration: srcDuration } = useSelector(sourceStore);
  const currentTime = usePlayheadTime();
  const duration = durationProp ?? srcDuration;

  const {
    trimStart,
    trimEnd,
    trimmedDuration,
    setTrimRange,
    setStartToCurrentTime,
    setEndToCurrentTime,
  } = useTrimRange({
    duration,
    minGap,
    initClampMargin,
    overshoot,
    onTrimChange,
  });

  const boundedCurrentTime = Math.min(Math.max(currentTime, 0), duration);

  const setStartToCurrent = useCallback(() => {
    const t = playerRef?.current?.currentTime ?? boundedCurrentTime;
    const ns = setStartToCurrentTime(t);
    // Nudge the player only when clamping moved the start behind the
    // playhead (t already equals player time, so equal values are no-ops).
    if (ns !== t) seekVideoElement(playerRef?.current ?? null, ns, duration);
  }, [playerRef, boundedCurrentTime, setStartToCurrentTime, duration]);

  const setEndToCurrent = useCallback(() => {
    const t = playerRef?.current?.currentTime ?? boundedCurrentTime;
    setEndToCurrentTime(t);
  }, [playerRef, boundedCurrentTime, setEndToCurrentTime]);

  const setPlayerToStart = useCallback(() => {
    seekVideoElement(playerRef?.current, Math.max(trimStart, 0), duration);
  }, [playerRef, trimStart, duration]);

  const setPlayerToEnd = useCallback(() => {
    seekVideoElement(playerRef?.current, Math.min(trimEnd, duration), duration);
  }, [playerRef, trimEnd, duration]);

  if (!file) return null;

  return (
    <Card className="overflow-hidden">
      <Collapsible defaultOpen>
        <CardHeader className="py-3">
          <CollapsibleTrigger className="flex w-full items-center justify-between text-sm font-semibold tracking-normal">
            <span>
              Trim
              <span
                className="ml-1.5 font-mono text-[11px] font-normal tabular-nums text-kumo-subtle"
                suppressHydrationWarning
              >
                {disabled ? (
                  <>Full length · {formatTime(duration)}</>
                ) : (
                  <>
                    {formatTime(trimStart)} → {formatTime(trimEnd)} ·{" "}
                    {formatTime(trimmedDuration)}
                  </>
                )}
              </span>
            </span>
            <ChevronDown className="size-4 text-kumo-subtle" />
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="space-y-3">
            <div
              className={cn(
                "rounded-lg border bg-kumo-recessed/20 p-3 space-y-3",
                disabled && "opacity-50 pointer-events-none",
              )}
              aria-disabled={disabled}
            >
              <div className="space-y-1">
                <TrimSlider
                  trimStart={trimStart}
                  trimEnd={trimEnd}
                  duration={duration}
                  sliderMax={sliderMax}
                  minGap={minGap}
                  currentTime={currentTime}
                  onSetTrimRange={setTrimRange}
                />
                <div className="flex justify-between text-[10px] text-kumo-subtle tabular-nums">
                  <span>Start {formatTime(trimStart)}</span>
                  <span>Duration {formatTime(trimmedDuration)}</span>
                  <span>End {formatTime(trimEnd)}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button size="sm" variant="outline" onClick={setStartToCurrent}>
                  Set Start to {formatTime(currentTime)}
                </Button>
                <Button size="sm" variant="outline" onClick={setEndToCurrent}>
                  Set End to {formatTime(currentTime)}
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button size="sm" variant="outline" onClick={setPlayerToStart}>
                  <SkipBack className="mr-2 size-4" />
                  Set Player to Start
                </Button>
                <Button size="sm" variant="outline" onClick={setPlayerToEnd}>
                  <SkipForward className="mr-2 size-4" />
                  Set Player to End
                </Button>
              </div>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
