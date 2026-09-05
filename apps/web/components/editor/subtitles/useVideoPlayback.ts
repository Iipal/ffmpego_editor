"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { clamp } from "@/lib/mobile-layout";
import { useVideoStore } from "@/store/useVideoStore";
import { NOOP } from "./heavy-modules";

type VideoStore = ReturnType<typeof useVideoStore>;

export type UseVideoPlaybackArgs = {
  mediaUrl: string | null;
  srcDuration: number;
  trimStart: number;
  trimEnd: number;
  videoStore: VideoStore;
};

// Video element sync + transport state for the subtitles editor.
// Owns the hidden <video> ref, playhead tick, trim/loop refs and effects.
export function useVideoPlayback({
  mediaUrl,
  srcDuration,
  trimStart,
  trimEnd,
  videoStore,
}: UseVideoPlaybackArgs) {
  const videoRef = useRef<HTMLVideoElement>(null);

  // rerender-use-ref-transient-values: transient currentTime via ref to avoid 60fps parent re-renders
  const currentTimeRef = useRef(0);
  const [currentTimeTick, setCurrentTimeTick] = useState(0);
  // read current time via ref for handlers, tick for render
  const currentTime = currentTimeRef.current;

  // Effect 2: duration/display sync — separate from font loading
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLooping, setIsLooping] = useState(false);
  const [volume, setVolumeState] = useState(1);
  const [muted, setMuted] = useState(false);
  const [previewHeight, setPreviewHeight] = useState(560);
  const previewWrapRef = useRef<HTMLDivElement>(null);

  const effectiveDuration = duration || srcDuration || 0;

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

  // advanced-event-handler-refs + rerender-use-ref-transient-values: keep latest trim/loop in refs for stable video handlers
  const trimStartRef = useRef(trimStart);
  const trimEndRef = useRef(trimEnd);
  const isLoopingRef = useRef(isLooping);
  useEffect(() => {
    trimStartRef.current = trimStart;
    trimEndRef.current = trimEnd;
    isLoopingRef.current = isLooping;
  }, [trimStart, trimEnd, isLooping]);

  // video event handling — split effects, narrow deps, passive listeners
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onLoadedMetadata = () => {
      const d = v.duration;
      if (Number.isFinite(d)) {
        setDuration(d);
      }
    };
    const onTimeUpdate = () => {
      const t = v.currentTime;
      const s = trimStartRef.current;
      const e = trimEndRef.current;
      const looping = isLoopingRef.current;
      if (looping && e > s) {
        if (t >= e - 0.02) {
          v.currentTime = s;
          currentTimeRef.current = s;
          setCurrentTimeTick((x) => (x + 1) % 1000000);
          return;
        }
        if (t < s - 0.01) {
          v.currentTime = s;
          currentTimeRef.current = s;
          setCurrentTimeTick((x) => (x + 1) % 1000000);
          return;
        }
      } else {
        if (t >= e - 0.01 && e > 0) {
          v.pause();
          v.currentTime = e;
          currentTimeRef.current = e;
          setIsPlaying(false);
          setCurrentTimeTick((x) => (x + 1) % 1000000);
          return;
        }
      }
      currentTimeRef.current = t;
      setCurrentTimeTick((x) => (x + 1) % 1000000);
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => {
      const s = trimStartRef.current;
      const e = trimEndRef.current;
      if (isLoopingRef.current && e > s) {
        v.currentTime = s;
        currentTimeRef.current = s;
        v.play().catch(NOOP);
      } else {
        setIsPlaying(false);
      }
    };
    v.addEventListener("loadedmetadata", onLoadedMetadata);
    // client-passive-event-listeners: passive for scroll-proximate events
    v.addEventListener("timeupdate", onTimeUpdate, {
      passive: true,
    } as AddEventListenerOptions);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("ended", onEnded);
    if (
      v.readyState >= 1 &&
      Number.isFinite(v.duration) &&
      v.duration !== duration
    ) {
      setDuration(v.duration);
    }
    return () => {
      v.removeEventListener("loadedmetadata", onLoadedMetadata);
      v.removeEventListener("timeupdate", onTimeUpdate);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("ended", onEnded);
    };
    // rerender-dependencies: only primitives/mediaUrl, videoRef omitted (stable ref)
  }, [mediaUrl, duration, videoStore]);

  // RAF sync for smooth playhead — throttled, uses ref to avoid 60fps re-renders of parent (rerender-use-ref-transient-values)
  useEffect(() => {
    if (!isPlaying) return;
    let raf = 0;
    let lastTick = 0;
    const loop = () => {
      const v = videoRef.current;
      if (v && !v.paused) {
        const t = v.currentTime;
        const s = trimStartRef.current;
        const e = trimEndRef.current;
        if (isLoopingRef.current && e > s && t >= e - 0.02) {
          v.currentTime = s;
        }
        currentTimeRef.current = v.currentTime;
        const now = performance.now();
        if (now - lastTick > 100) {
          lastTick = now;
          setCurrentTimeTick((x) => (x + 1) % 1000000);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying]);

  // sync play/pause to video element — rerender-move-effect-to-event: keep minimal, narrow deps
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (isPlaying) v.play().catch(() => setIsPlaying(false));
    else v.pause();
  }, [isPlaying]);

  // shared transport: keep element volume/muted in sync
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = volume;
    v.muted = muted;
  }, [volume, muted]);

  const setVolume = useCallback((v: number) => {
    const next = clamp(v, 0, 1);
    setVolumeState(next);
    if (next > 0) setMuted(false);
  }, []);

  const toggleMute = useCallback(() => setMuted((m) => !m), []);

  // rerender-derived-state: derived staleness hint (no effect)
  void currentTimeTick;

  const playFromTrimStart = useCallback(() => {
    const v = videoRef.current;
    if (!v || effectiveDuration === 0) return;
    const cur = currentTimeRef.current;
    const s = trimStartRef.current;
    const e = trimEndRef.current;
    if (cur < s || cur > e) {
      v.currentTime = s;
      currentTimeRef.current = s;
    } else {
      v.currentTime = s;
      currentTimeRef.current = s;
    }
    setCurrentTimeTick((x) => (x + 1) % 1000000);
    setIsPlaying(true);
  }, [effectiveDuration]);

  const togglePlayback = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (!isPlaying) {
      const cur = v.currentTime;
      const s = trimStartRef.current;
      const e = trimEndRef.current;
      if (cur < s || cur >= e) {
        v.currentTime = s;
        currentTimeRef.current = s;
        setCurrentTimeTick((x) => (x + 1) % 1000000);
      }
      setIsPlaying(true);
    } else {
      setIsPlaying(false);
    }
  }, [isPlaying]);

  const toggleLoop = useCallback(() => setIsLooping((v) => !v), []);

  const handleProgressSeek = useCallback(
    (value: number) => {
      const v = videoRef.current;
      if (!v || effectiveDuration === 0) return;
      const t = clamp(value, trimStartRef.current, trimEndRef.current);
      v.currentTime = t;
      currentTimeRef.current = t;
      setCurrentTimeTick((x) => (x + 1) % 1000000);
    },
    [effectiveDuration],
  );

  const handleTimelineSeek = useCallback(
    (time: number) => {
      const v = videoRef.current;
      if (!v) return;
      const t = clamp(time, 0, effectiveDuration);
      v.currentTime = t;
      currentTimeRef.current = t;
      setCurrentTimeTick((x) => (x + 1) % 1000000);
    },
    [effectiveDuration],
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
