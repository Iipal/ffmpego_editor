"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { mobileLayoutService } from "@/lib/mobile-layout";
import { NOOP } from "./heavy-modules";
import { useSelector } from "@tanstack/react-store";
import { sourceStore, setSourceState } from "@/store/sourceSlice";
import { mobileStore, setMobileState } from "@/store/mobileSlice";
import { audioStore } from "@/store/audioSlice";
import { cutStore } from "@/store/cutSlice";
import { useAudioPreview } from "@/hooks/useAudioPreview";

export type UseVideoPlaybackArgs = {
  mediaUrl: string | null;
  srcDuration: number;
  trimStart: number;
  trimEnd: number;
};

// Video element sync + transport state for the subtitles editor.
// Owns the hidden <video> ref, playhead tick, trim/loop refs and effects.
export function useVideoPlayback({
  mediaUrl,
  srcDuration,
  trimStart,
  trimEnd,
}: UseVideoPlaybackArgs) {
  const videoRef = useRef<HTMLVideoElement>(null);

  // rerender-use-ref-transient-values: transient currentTime via ref to avoid 60fps parent re-renders
  const currentTimeRef = useRef(sourceStore.state.currentTime);
  // read current time via ref for handlers, tick for render
  const currentTime = useSelector(sourceStore).currentTime;

  // Effect 2: duration/display sync — separate from font loading
  const source = useSelector(sourceStore);
  const { duration, isPlaying, volume, isMuted: muted } = source;
  const isLooping = useSelector(mobileStore).isLoopEnabled;
  const [previewHeight, setPreviewHeight] = useState(560);
  const previewWrapRef = useRef<HTMLDivElement>(null);
  const { file } = source;
  const { tracks } = useSelector(audioStore);
  const trackCount = tracks.length;
  const { playbackSpeed } = useSelector(cutStore);
  useAudioPreview({ file, mediaUrl, videoRef, tracks, volume, muted });

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
        setSourceState((previous) => ({ ...previous, duration: d }));
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
          setSourceState((previous) => ({ ...previous, currentTime: s }));
          return;
        }
        if (t < s - 0.01) {
          v.currentTime = s;
          currentTimeRef.current = s;
          setSourceState((previous) => ({ ...previous, currentTime: s }));
          return;
        }
      } else {
        if (t >= e - 0.01 && e > 0) {
          v.pause();
          v.currentTime = e;
          currentTimeRef.current = e;
          setSourceState((previous) => ({
            ...previous,
            isPlaying: false,
            currentTime: e,
          }));
          return;
        }
      }
      currentTimeRef.current = t;
      setSourceState((previous) => ({ ...previous, currentTime: t }));
    };
    const onPlay = () =>
      setSourceState((previous) => ({ ...previous, isPlaying: true }));
    const onPause = () =>
      setSourceState((previous) => ({ ...previous, isPlaying: false }));
    const onEnded = () => {
      const s = trimStartRef.current;
      const e = trimEndRef.current;
      if (isLoopingRef.current && e > s) {
        v.currentTime = s;
        currentTimeRef.current = s;
        v.play().catch(NOOP);
      } else {
        setSourceState((previous) => ({ ...previous, isPlaying: false }));
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
      setSourceState((previous) => ({ ...previous, duration: v.duration }));
    }
    return () => {
      v.removeEventListener("loadedmetadata", onLoadedMetadata);
      v.removeEventListener("timeupdate", onTimeUpdate);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("ended", onEnded);
    };
    // rerender-dependencies: only primitives/mediaUrl, videoRef omitted (stable ref)
  }, [mediaUrl, duration]);

  // RAF sync for smooth playhead — throttled, uses ref to avoid 60fps re-renders of parent (rerender-use-ref-transient-values)
  useEffect(() => {
    if (!isPlaying) return;
    let raf = 0;
    let lastTick = 0;
    const loop = () => {
      const v = videoRef.current;
      if (v && !v.paused) {
        const s = trimStartRef.current;
        const e = trimEndRef.current;
        if (isLoopingRef.current && e > s && v.currentTime >= e - 0.02) {
          v.currentTime = s;
        }
        const t = v.currentTime;
        currentTimeRef.current = t;
        const now = performance.now();
        if (now - lastTick > 100) {
          lastTick = now;
          setSourceState((previous) =>
            previous.currentTime === t
              ? previous
              : { ...previous, currentTime: t },
          );
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
    if (isPlaying)
      v.play().catch(() =>
        setSourceState((previous) => ({ ...previous, isPlaying: false })),
      );
    else v.pause();
  }, [isPlaying]);

  // shared transport: keep element volume/muted/rate in sync (parity with
  // the main VideoPlayer — mute the element while WebAudio preview tracks
  // exist so audio isn't doubled; never set video.loop here, the JS
  // trim-loop / pause-at-end logic above owns looping)
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = volume;
    v.muted = trackCount > 0 ? true : muted;
  }, [volume, muted, trackCount]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.playbackRate = playbackSpeed;
  }, [playbackSpeed, mediaUrl]);

  const setVolume = useCallback((v: number) => {
    const next = mobileLayoutService.clamp(v, 0, 1);
    setSourceState((previous) => ({
      ...previous,
      volume: next,
      isMuted: next > 0 ? false : previous.isMuted,
    }));
  }, []);

  const toggleMute = useCallback(
    () =>
      setSourceState((previous) => ({
        ...previous,
        isMuted: !previous.isMuted,
      })),
    [],
  );

  // rerender-derived-state: derived staleness hint (no effect)

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
    setSourceState((previous) => ({
      ...previous,
      currentTime: s,
      isPlaying: true,
    }));
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
        setSourceState((previous) => ({ ...previous, currentTime: s }));
      }
      setSourceState((previous) => ({ ...previous, isPlaying: true }));
    } else {
      setSourceState((previous) => ({ ...previous, isPlaying: false }));
    }
  }, [isPlaying]);

  const toggleLoop = useCallback(
    () =>
      setMobileState((previous) => ({
        ...previous,
        isLoopEnabled: !previous.isLoopEnabled,
      })),
    [],
  );

  const handleProgressSeek = useCallback(
    (value: number) => {
      const v = videoRef.current;
      if (!v || effectiveDuration === 0) return;
      const t = mobileLayoutService.clamp(value, trimStartRef.current, trimEndRef.current);
      v.currentTime = t;
      currentTimeRef.current = t;
      setSourceState((previous) => ({ ...previous, currentTime: t }));
    },
    [effectiveDuration],
  );

  const handleTimelineSeek = useCallback(
    (time: number) => {
      const v = videoRef.current;
      if (!v) return;
      const t = mobileLayoutService.clamp(time, 0, effectiveDuration);
      v.currentTime = t;
      currentTimeRef.current = t;
      setSourceState((previous) => ({ ...previous, currentTime: t }));
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
