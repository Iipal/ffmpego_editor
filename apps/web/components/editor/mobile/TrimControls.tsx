"use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/format-time";
import { clamp } from "@/lib/mobile-layout";

type TrimControlsProps = {
  trimStart: number;
  trimEnd: number;
  trimmedDuration: number;
  duration: number;
  currentTime: number;
  ignoreTrim: boolean;
  isLoopTrim: boolean;
  setIsLoopTrim: (v: boolean) => void;
  onSetTrimRange: (range: [number, number]) => void;
  onSetStartToCurrent: () => void;
  onSetEndToCurrent: () => void;
};

export function TrimControls({
  trimStart,
  trimEnd,
  trimmedDuration,
  duration,
  currentTime,
  ignoreTrim,
  isLoopTrim,
  setIsLoopTrim,
  onSetTrimRange,
  onSetStartToCurrent,
  onSetEndToCurrent,
}: TrimControlsProps) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-kumo-recessed/20 p-3 space-y-3",
        ignoreTrim && "opacity-50 pointer-events-none",
      )}
      aria-disabled={ignoreTrim}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold">Trim</span>
        <span className="text-[11px] tabular-nums text-kumo-subtle">
          {ignoreTrim ? (
            <>Full length · {formatTime(duration)}</>
          ) : (
            <>
              {formatTime(trimStart)} → {formatTime(trimEnd)} ·{" "}
              {formatTime(trimmedDuration)}
            </>
          )}
        </span>
      </div>
      <div className="space-y-1">
        <div className="relative py-2">
          <Slider
            value={[trimStart, trimEnd]}
            min={0}
            max={duration || 30}
            step={0.05}
            onValueChange={(v) => {
              const vals = Array.isArray(v)
                ? (v as number[])
                : [v as number, duration];
              const [ns, ne] = vals as [number, number];
              if (ne - ns >= 0.2) onSetTrimRange([ns, ne]);
            }}
          />
          {duration > 0 ? (
            <div
              className={cn(
                "pointer-events-none absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10 flex flex-col items-center",
                (currentTime < trimStart - 0.02 ||
                  currentTime > trimEnd + 0.02) &&
                  "opacity-40",
              )}
              style={{
                left: `${clamp((currentTime / duration) * 100, 0, 100)}%`,
              }}
              aria-hidden
            >
              <div className="size-2 rounded-full bg-kumo-brand border border-white shadow -mb-0.5" />
              <div className="w-0.5 h-4 bg-kumo-brand rounded-full shadow" />
            </div>
          ) : null}
        </div>
        <div className="flex justify-between text-[10px] text-kumo-subtle tabular-nums">
          <span>Start {formatTime(trimStart)}</span>
          <span>Duration {formatTime(trimmedDuration)}</span>
          <span>End {formatTime(trimEnd)}</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button size="sm" variant="outline" onClick={onSetStartToCurrent}>
          Set Start to {formatTime(currentTime)}
        </Button>
        <Button size="sm" variant="outline" onClick={onSetEndToCurrent}>
          Set End to {formatTime(currentTime)}
        </Button>
      </div>
      <div className="flex items-center justify-between">
        <Label className="text-xs">Loop trimmed</Label>
        <Switch checked={isLoopTrim} onCheckedChange={setIsLoopTrim} />
      </div>
    </div>
  );
}
