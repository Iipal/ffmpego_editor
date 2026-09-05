"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/format-time";
import { TRIM_MIN_GAP_DEFAULT } from "./useTrimRange";
import { TrimSlider } from "./TrimSlider";

export type TrimControlsProps = {
  trimStart: number;
  trimEnd: number;
  /** Defaults to max(0, trimEnd - trimStart). */
  trimmedDuration?: number;
  duration: number;
  /** Playhead marker + "set to current time" labels. Omitted = no marker. */
  currentTime?: number;
  /** Dims + disables the surface (e.g. ignoreTrim). */
  disabled?: boolean;
  /** Minimum allowed trim length. */
  minGap?: number;
  /** Slider max override. Defaults to duration || TRIM_SLIDER_MAX_FALLBACK. */
  sliderMax?: number;
  title?: string;
  onSetTrimRange: (range: [number, number]) => void;
  showReadout?: boolean;
  showSetToCurrentButtons?: boolean;
  onSetStartToCurrent?: () => void;
  onSetEndToCurrent?: () => void;
  showLoopSwitch?: boolean;
  isLoopTrim?: boolean;
  onLoopTrimChange?: (v: boolean) => void;
  showNumericInputs?: boolean;
};

// Shared trim editor: header label + dual-range slider with opt-in playhead
// marker, readout row, set-start/end-to-current buttons, numeric inputs and
// loop switch. Mobile enables everything but numeric inputs; subtitles enables
// numeric inputs only.
export function TrimControls({
  trimStart,
  trimEnd,
  trimmedDuration = Math.max(0, trimEnd - trimStart),
  duration,
  currentTime,
  disabled = false,
  minGap = TRIM_MIN_GAP_DEFAULT,
  sliderMax,
  title = "Trim",
  onSetTrimRange,
  showReadout = true,
  showSetToCurrentButtons = false,
  onSetStartToCurrent,
  onSetEndToCurrent,
  showLoopSwitch = false,
  isLoopTrim = false,
  onLoopTrimChange,
  showNumericInputs = false,
}: TrimControlsProps) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-kumo-recessed/20 p-3 space-y-3",
        disabled && "opacity-50 pointer-events-none",
      )}
      aria-disabled={disabled}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold">{title}</span>
        <span
          className="text-[11px] tabular-nums text-kumo-subtle"
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
      </div>
      <div className="space-y-1">
        <TrimSlider
          trimStart={trimStart}
          trimEnd={trimEnd}
          duration={duration}
          sliderMax={sliderMax}
          minGap={minGap}
          currentTime={currentTime}
          onSetTrimRange={onSetTrimRange}
        />
        {showReadout ? (
          <div className="flex justify-between text-[10px] text-kumo-subtle tabular-nums">
            <span>Start {formatTime(trimStart)}</span>
            <span>Duration {formatTime(trimmedDuration)}</span>
            <span>End {formatTime(trimEnd)}</span>
          </div>
        ) : null}
      </div>
      {showSetToCurrentButtons ? (
        <div className="grid grid-cols-2 gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={onSetStartToCurrent}
          >
            Set Start to {formatTime(currentTime ?? trimStart)}
          </Button>
          <Button size="sm" variant="outline" onClick={onSetEndToCurrent}>
            Set End to {formatTime(currentTime ?? trimEnd)}
          </Button>
        </div>
      ) : null}
      {showNumericInputs ? (
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
                if (Number.isFinite(v)) onSetTrimRange([v, trimEnd]);
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
                if (Number.isFinite(v)) onSetTrimRange([trimStart, v]);
              }}
            />
          </div>
        </div>
      ) : null}
      {showLoopSwitch ? (
        <div className="flex items-center justify-between">
          <Label className="text-xs">Loop trimmed</Label>
          <Switch
            checked={isLoopTrim}
            onCheckedChange={onLoopTrimChange}
          />
        </div>
      ) : null}
    </div>
  );
}
