"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { mobileLayoutService } from "@/lib/mobile-layout";
import { useSelector } from "@tanstack/react-store";
import { commitPlayheadTime } from "@/store/playheadSlice";
import { sourceStore } from "@/store/sourceSlice";
import { usePlaybackEngine } from "@/components/editor/shared/usePlaybackEngine";

export type UseVideoPlaybackArgs = {
  mediaUrl: string | null;
  srcDuration: number;
  trimStart: number;
  trimEnd: number;
};

// Video element sync + transport state for the subtitles editor.
// Thin wrapper over the shared playback engine: trim loop / pause-at-end
// policy comes from `trimRange` + `trimLoop`, transport + volume/mute/rate
// sync from the engine. Only the preview-height layout observer and the
// trim-aware seek helpers below are subtitles-specific.
export function useVideoPlayback({
  mediaUrl,
  srcDuration,
  trimStart,
  trimEnd,
}: UseVideoPlaybackArgs) {
  const videoRef = useRef<HTMLVideoElement>(null);

  const isLooping = useSelector(sourceStore, (s) => s.isLoopEnabled);

  const engine = usePlaybackEngine(videoRef, {
    mediaUrl,
    trimRange: [trimStart, trimEnd],
    trimLoop: isLooping,
    // 10 Hz throttled snapshots + rAF smooth sync while playing (same
    // cadence family as the crop/mobile players).
    throttleMs: 100,
  });

  const {
    duration,
    isPlaying,
    volume,
    muted,
    currentTime,
    timeRef: currentTimeRef,
    setVolume,
    toggleMute,
    toggleLoop,
    seekTo,
  } = engine;

  const effectiveDuration = duration || srcDuration || 0;

  const [previewHeight, setPreviewHeight] = useState(560);
  const previewWrapRef = useRef<HTMLDivElement>(null);

  // ResizeObserver — keep stable, batch writes via cssText / class (js-batch-dom-css)
  useEffect(() => {
    const el = previewWrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;

    let raf = 0;

    const obs = new ResizeObserver((entries) => {
      const entry = entries[0] as unknown as {
        contentRect: DOMRectReadOnly;
        borderBoxSize?: Array<{ blockSize: number; inlineSize: number }>;
      };
      const raw =
        entry.borderBoxSize?.[0]?.blockSize ??
        el.getBoundingClientRect().height;
      const h = Math.round(raw);

      if (!h || !Number.isFinite(h)) return;

      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const clamped = Math.max(320, Math.min(900, h));
        setPreviewHeight((prev) =>
          Math.abs(prev - clamped) > 2 ? clamped : prev,
        );
      });
    });

    obs.observe(el);

    return () => {
      cancelAnimationFrame(raf);
      obs.disconnect();
    };
  }, []);

  // Latest trim in refs for stable seek helpers.
  const trimStartRef = useRef(trimStart);
  const trimEndRef = useRef(trimEnd);
  useEffect(() => {
    trimStartRef.current = trimStart;
    trimEndRef.current = trimEnd;
  }, [trimStart, trimEnd]);

  // rerender-derived-state: derived staleness hint (no effect)

  const playFromTrimStart = useCallback(() => {
    const v = videoRef.current;
    if (!v || effectiveDuration === 0) return;

    const s = trimStartRef.current;

    v.currentTime = s;
    currentTimeRef.current = s;

    commitPlayheadTime(s);
    // Direct-drive the element; the engine mirrors isPlaying from events.
    v.play().catch(() => {});
  }, [effectiveDuration, currentTimeRef]);

  const togglePlayback = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;

    if (v.paused) {
      const cur = v.currentTime;
      const s = trimStartRef.current;
      const e = trimEndRef.current;

      if (cur < s || cur >= e) {
        v.currentTime = s;
        currentTimeRef.current = s;
        commitPlayheadTime(s);
      }

      v.play().catch(() => {});
    } else {
      v.pause();
    }
  }, [currentTimeRef]);

  const handleProgressSeek = useCallback(
    (value: number) => {
      if (effectiveDuration === 0) return;

      const t = mobileLayoutService.clamp(
        value,
        trimStartRef.current,
        trimEndRef.current,
      );
      seekTo(t);
    },
    [effectiveDuration, seekTo],
  );

  const handleTimelineSeek = useCallback(
    (time: number) => {
      const t = mobileLayoutService.clamp(time, 0, effectiveDuration);
      seekTo(t);
    },
    [effectiveDuration, seekTo],
  );

  return {
    videoRef,
    previewWrapRef,
    previewHeight,
    setPreviewHeight,
    duration,
    effectiveDuration,
    isPlaying,
    isLooping,
    volume,
    muted,
    currentTime,
    currentTimeRef,
    trimStartRef,
    trimEndRef,
    playFromTrimStart,
    togglePlayback,
    toggleLoop,
    setVolume,
    toggleMute,
    handleProgressSeek,
    handleTimelineSeek,
  };
}
