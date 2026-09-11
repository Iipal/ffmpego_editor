"use client";

import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { mobileLayoutService } from "@/lib/mobile-layout";
import { TRIM_MIN_GAP_DEFAULT, TRIM_SLIDER_MAX_FALLBACK } from "./useTrimRange";

export type TrimSliderProps = {
  trimStart: number;
  trimEnd: number;
  duration: number;
  /** Slider max override. Defaults to duration || TRIM_SLIDER_MAX_FALLBACK. */
  sliderMax?: number;
  step?: number;
  /** Minimum allowed trim length. 0 = raw commits (main timeline). */
  minGap?: number;
  /** Playhead marker overlay. Omitted = no overlay. */
  currentTime?: number;
  sliderClassName?: string;
  wrapperClassName?: string;
  onSetTrimRange: (range: [number, number]) => void;
};

// Shared dual-range trim slider with playhead overlay, composed by the
// self-owned TrimControls card.
export function TrimSlider({
  trimStart,
  trimEnd,
  duration,
  sliderMax,
  step = 0.05,
  minGap = TRIM_MIN_GAP_DEFAULT,
  currentTime,
  sliderClassName,
  wrapperClassName = "relative py-2",
  onSetTrimRange,
}: TrimSliderProps) {
  const max = sliderMax ?? duration ?? TRIM_SLIDER_MAX_FALLBACK;
  return (
    <div className={wrapperClassName}>
      <Slider
        className={sliderClassName}
        value={[trimStart, trimEnd]}
        min={0}
        max={max || TRIM_SLIDER_MAX_FALLBACK}
        step={step}
        onValueChange={(v) => {
          const vals = Array.isArray(v)
            ? (v as number[])
            : [v as number, duration];
          const [ns, ne] = vals as [number, number];
          if (ne - ns >= minGap) onSetTrimRange([ns, ne]);
        }}
        aria-label="Trim range"
      />
      {currentTime !== undefined && duration > 0 ? (
        <div
          className={cn(
            "pointer-events-none absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10 flex flex-col items-center",
            (currentTime < trimStart - 0.02 || currentTime > trimEnd + 0.02) &&
              "opacity-40",
          )}
          style={{
            left: `${mobileLayoutService.clamp((currentTime / duration) * 100, 0, 100)}%`,
          }}
          aria-hidden
        >
          <div className="size-2 rounded-full bg-kumo-brand border border-white shadow -mb-0.5" />
          <div className="w-0.5 h-4 bg-kumo-brand rounded-full shadow" />
        </div>
      ) : null}
    </div>
  );
}
