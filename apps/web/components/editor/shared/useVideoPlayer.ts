"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { clamp } from "@/lib/mobile-layout";
import { NOOP } from "@/lib/utils";

export type UseVideoPlayerOptions = {
  /** Initial volume 0..1 (default 1). */
  initialVolume?: number;
  /** Initial muted flag (default false). */
  initialMuted?: boolean;
  /** Initial native-loop flag (default false). */
  initialLoop?: boolean;
  /**
   * Trim-loop window. While set, time updates that leave the window jump
   * back to its start, and `ended` restarts playback from the start.
   * Pass null to disable. Default null.
   */
  loopRange?: [number, number] | null;
  /**
   * Minimum ms between `currentTime` state updates. `timeRef` is always
   * live; only the re-rendering state snapshot is throttled. Default 0.
   */
  throttleMs?: number;
  /** Extra per-tick logic (e.g. cut play-all jumping). Runs after clamp. */
  onTime?: (video: HTMLVideoElement) => void;
  /** Runs on loadedmetadata, after duration state is set. */
  onMetadata?: (video: HTMLVideoElement) => void;
  /** Overrides the default `ended` handling when provided. */
  onEnded?: (video: HTMLVideoElement) => void;
};

export type UseVideoPlayerResult = {
  isPlaying: boolean;
  /** Render snapshot of playhead (throttled per `throttleMs`). */
  currentTime: number;
  /** Always-live playhead; read in event handlers without re-rendering. */
  timeRef: RefObject<number>;
  duration: number;
  volume: number;
  muted: boolean;
  loop: boolean;
  setVolume: (v: number) => void;
  setMuted: (m: boolean) => void;
  toggleMute: () => void;
  setLoop: (l: boolean) => void;
  toggleLoop: () => void;
  togglePlay: () => void;
  play: () => void;
  pause: () => void;
  seekTo: (t: number) => void;
  playFromStart: (start?: number) => void;
};

/**
 * Shared video-element transport state. Attaches play/pause/timeupdate/
 * seeked/ended/loadedmetadata listeners once per media and keeps the
 * element in sync for volume/muted/loop.
 *
 * Pages keep their own domain logic (cut jumping, trim clamping, canvas
 * sync) and drive the shared <VideoPlayerControls /> from this result.
 */
export function useVideoPlayer(
  videoRef: RefObject<HTMLVideoElement | null>,
  options: UseVideoPlayerOptions = {},
): UseVideoPlayerResult {
  const {
    initialVolume = 1,
    initialMuted = false,
    initialLoop = false,
    loopRange = null,
    throttleMs = 0,
    onTime,
    onMetadata,
    onEnded,
  } = options;

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(initialVolume);
  const [muted, setMuted] = useState(initialMuted);
  const [loop, setLoop] = useState(initialLoop);

  const timeRef = useRef(0);
  const lastTickRef = useRef(0);

  // Latest-callback refs so element listeners stay stable.
  const loopRangeRef = useRef(loopRange);
  const throttleRef = useRef(throttleMs);
  const onTimeRef = useRef(onTime);
  const onMetadataRef = useRef(onMetadata);
  const onEndedRef = useRef(onEnded);
  useEffect(() => {
    loopRangeRef.current = loopRange;
    throttleRef.current = throttleMs;
    onTimeRef.current = onTime;
    onMetadataRef.current = onMetadata;
    onEndedRef.current = onEnded;
  }, [loopRange, throttleMs, onTime, onMetadata, onEnded]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    const pushTime = (t: number) => {
      timeRef.current = t;
      const now = performance.now();
      if (
        throttleRef.current <= 0 ||
        now - lastTickRef.current >= throttleRef.current
      ) {
        lastTickRef.current = now;
        setCurrentTime(t);
      }
    };

    const onTimeUpdate = () => {
      const range = loopRangeRef.current;
      if (range) {
        const [s, e] = range;
        if (e > s && (v.currentTime >= e - 0.02 || v.currentTime < s - 0.01)) {
          v.currentTime = s;
          pushTime(s);
          onTimeRef.current?.(v);
          return;
        }
      }
      pushTime(v.currentTime);
      onTimeRef.current?.(v);
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEndedNative = () => {
      if (onEndedRef.current) {
        onEndedRef.current(v);
        return;
      }
      const range = loopRangeRef.current;
      if (range && range[1] > range[0]) {
        v.currentTime = range[0];
        pushTime(range[0]);
        v.play().catch(NOOP);
      } else {
        setIsPlaying(false);
      }
    };
    const onMeta = () => {
      const d = v.duration;
      if (Number.isFinite(d)) setDuration(d);
      onMetadataRef.current?.(v);
    };

    v.addEventListener("timeupdate", onTimeUpdate, {
      passive: true,
    } as AddEventListenerOptions);
    v.addEventListener("seeked", onTimeUpdate);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("ended", onEndedNative);
    v.addEventListener("loadedmetadata", onMeta);
    if (Number.isFinite(v.duration) && v.duration > 0) setDuration(v.duration);
    return () => {
      v.removeEventListener("timeupdate", onTimeUpdate);
      v.removeEventListener("seeked", onTimeUpdate);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("ended", onEndedNative);
      v.removeEventListener("loadedmetadata", onMeta);
    };
  }, [videoRef]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.volume = volume;
  }, [volume, videoRef]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted;
  }, [muted, videoRef]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.loop = loop;
  }, [loop, videoRef]);

  const setVolume = useCallback((v: number) => {
    const next = clamp(v, 0, 1);
    setVolumeState(next);
    if (next > 0) setMuted(false);
  }, []);

  const toggleMute = useCallback(() => setMuted((m) => !m), []);
  const toggleLoop = useCallback(() => setLoop((l) => !l), []);

  const play = useCallback(() => {
    videoRef.current?.play().catch(() => setIsPlaying(false));
  }, [videoRef]);

  const pause = useCallback(() => {
    videoRef.current?.pause();
  }, [videoRef]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => setIsPlaying(false));
    else v.pause();
  }, [videoRef]);

  const seekTo = useCallback(
    (t: number) => {
      const v = videoRef.current;
      if (!v) return;
      const d =
        Number.isFinite(v.duration) && v.duration > 0
          ? v.duration
          : timeRef.current;
      v.currentTime = clamp(t, 0, Math.max(0.01, d || 0));
      timeRef.current = v.currentTime;
      setCurrentTime(v.currentTime);
    },
    [videoRef],
  );

  const playFromStart = useCallback(
    (start = 0) => {
      seekTo(start);
      videoRef.current?.play().catch(NOOP);
    },
    [seekTo, videoRef],
  );

  return {
    isPlaying,
    currentTime,
    timeRef,
    duration,
    volume,
    muted,
    loop,
    setVolume,
    setMuted,
    toggleMute,
    setLoop,
    toggleLoop,
    togglePlay,
    play,
    pause,
    seekTo,
    playFromStart,
  };
}
