"use client";

import { useCallback, useEffect, useMemo, useRef, useTransition } from "react";
import { useVideoState, useVideoStore } from "@/store/useVideoStore";
import { clamp } from "@/lib/mobile-layout";

export const TRIM_MIN_GAP_DEFAULT = 0.2;
export const TRIM_SLIDER_MAX_FALLBACK = 30;

export type TrimRangeTuple = [number, number];
export type TrimRangeUpdater =
  | TrimRangeTuple
  | ((prev: TrimRangeTuple) => TrimRangeTuple);

type UseTrimRangeOptions = {
  /** Full media duration; init/clamp effects and clamping are skipped while <= 0. */
  duration: number;
  /** Minimum allowed trim length (mobile: 0.2, subtitles: MIN_SUBTITLE_DURATION). */
  minGap?: number;
  /** Margin used when clamping an overshooting start back from duration. Defaults to minGap. */
  initClampMargin?: number;
  /** What to do when trimEnd overshoots duration: "reset" to [0, duration]
   * (mobile) or "clamp" preserving start (subtitles). Defaults to "clamp". */
  overshoot?: "reset" | "clamp";
  /** Extra side-effect after a committed range change (e.g. retime subtitles). Gets resolved values. */
  onTrimChange?: (start: number, end: number) => void;
};

// Shared trim-range state: owns the video-store trimRange tuple, init/clamp on
// duration, clamped commits, and set-start/end-to-time helpers. Pages keep only
// their page-specific extras (loop-seek, ignoreTrim label, subtitle retiming).
export function useTrimRange({
  duration,
  minGap = TRIM_MIN_GAP_DEFAULT,
  initClampMargin = minGap,
  overshoot = "clamp",
  onTrimChange,
}: UseTrimRangeOptions) {
  const videoStore = useVideoStore();
  const { trimRange } = useVideoState() as unknown as {
    trimRange: TrimRangeTuple;
  };
  const [, startTransition] = useTransition();

  const onTrimChangeRef = useRef(onTrimChange);
  useEffect(() => {
    onTrimChangeRef.current = onTrimChange;
  });

  const trimStart = trimRange[0];
  const trimEnd = trimRange[1];
  const trimmedDuration = useMemo(
    () => Math.max(0, trimEnd - trimStart),
    [trimStart, trimEnd],
  );

  // init/clamp global trim when duration available
  useEffect(() => {
    if (duration <= 0) return;
    if (trimEnd === 0) {
      videoStore.setState((prev) => {
        const cur = (
          prev as unknown as { trimRange?: TrimRangeTuple }
        ).trimRange ?? ([0, 0] as TrimRangeTuple);
        if (cur[1] === 0)
          return {
            ...prev,
            trimRange: [0, duration] as TrimRangeTuple,
          };
        return prev;
      });
    } else if (trimEnd > duration) {
      if (overshoot === "reset") {
        videoStore.setState((prev) => ({
          ...prev,
          trimRange: [0, duration] as TrimRangeTuple,
        }));
      } else {
        videoStore.setState((prev) => {
          const cur = (
            prev as unknown as { trimRange?: TrimRangeTuple }
          ).trimRange ?? ([0, 0] as TrimRangeTuple);
          const ns = Math.min(cur[0], Math.max(0, duration - initClampMargin));
          return {
            ...prev,
            trimRange: [ns, duration] as TrimRangeTuple,
          };
        });
      }
    }
  }, [duration, trimEnd, initClampMargin, overshoot, videoStore]);

  const setTrimRange = useCallback(
    (updater: TrimRangeUpdater) => {
      const d = duration;
      const cur =
        (videoStore.state as unknown as { trimRange?: TrimRangeTuple })
          .trimRange ?? ([0, 0] as TrimRangeTuple);
      const [rs, re] =
        typeof updater === "function"
          ? (updater as (p: TrimRangeTuple) => TrimRangeTuple)(cur)
          : updater;
      let s = rs;
      let e = re;
      if (d > 0) {
        s = clamp(s, 0, Math.max(0, d - minGap));
        e = clamp(e, s + minGap, d);
        if (e - s < minGap) return;
      }
      if (s === cur[0] && e === cur[1]) return;
      const next: TrimRangeTuple = [s, e];
      startTransition(() => {
        videoStore.setState((prev) => ({ ...prev, trimRange: next }));
      });
      onTrimChangeRef.current?.(s, e);
    },
    [duration, minGap, videoStore, startTransition],
  );

  const handleTrimChange = useCallback(
    (newStart: number, newEnd: number) => {
      setTrimRange([newStart, newEnd]);
    },
    [setTrimRange],
  );

  const setStartToCurrentTime = useCallback(
    (t: number) => {
      const cur =
        (videoStore.state as unknown as { trimRange?: TrimRangeTuple })
          .trimRange ?? ([0, 0] as TrimRangeTuple);
      const ns = clamp(t, 0, cur[1] - minGap);
      setTrimRange([ns, cur[1]]);
      return ns;
    },
    [minGap, setTrimRange, videoStore],
  );

  const setEndToCurrentTime = useCallback(
    (t: number) => {
      const cur =
        (videoStore.state as unknown as { trimRange?: TrimRangeTuple })
          .trimRange ?? ([0, 0] as TrimRangeTuple);
      const dur = duration || TRIM_SLIDER_MAX_FALLBACK;
      const ne = clamp(t, cur[0] + minGap, dur);
      setTrimRange([cur[0], ne]);
      return ne;
    },
    [duration, minGap, setTrimRange, videoStore],
  );

  return {
    trimRange,
    trimStart,
    trimEnd,
    trimmedDuration,
    setTrimRange,
    handleTrimChange,
    setStartToCurrentTime,
    setEndToCurrentTime,
  };
}

export type TrimRangeState = ReturnType<typeof useTrimRange>;
