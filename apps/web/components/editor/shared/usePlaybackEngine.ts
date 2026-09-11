"use client";

import { useCallback, useEffect, useRef } from "react";
import type { RefObject } from "react";
import { mobileLayoutService } from "@/lib/mobile-layout";
import { NOOP } from "@/lib/utils";
import { useSelector } from "@tanstack/react-store";
import { sourceStore } from "@/store/sourceSlice";
import { setSourceState } from "@/store/sourceSlice";
import {
  commitPlayheadTime,
  setPlayheadTime,
  usePlayheadTime,
} from "@/store/playheadSlice";
import { mobileStore, setMobileState } from "@/store/mobileSlice";
import { audioStore } from "@/store/audioSlice";
import { cutStore } from "@/store/cutSlice";
import { useAudioPreview } from "@/hooks/useAudioPreview";

export type UsePlaybackEngineOptions = {
  mediaUrl?: string | null;
  /**
   * Unconditional trim-loop window. While set, time updates that leave the
   * window jump back to its start, and `ended` restarts playback from the
   * start. Pass null to disable. Default null.
   *
   * Legacy alias of the mobile/crop loop behavior. When set, it wins over
   * `trimRange`/`trimLoop`.
   */
  loopRange?: [number, number] | null;
  /**
   * Trim window with a loop-vs-pause policy (subtitles behavior). Ignored
   * while `loopRange` is set. When `trimLoop` is true the window loops like
   * `loopRange`; when false, reaching the end pauses at `trimRange[1]` and
   * seeks before the start jump to `trimRange[0]`.
   */
  trimRange?: [number, number] | null;
  /** Loop switch for `trimRange`. Default false (pause at end). */
  trimLoop?: boolean;
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

export type UsePlaybackEngineResult = {
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
 * Clamp a seek target to `[0, duration]` and apply it to the element plus
 * the committed playhead (transient + source snapshot). Shared by the
 * engine's `seekTo` and page-level seek helpers so clamping never drifts.
 */
export function seekVideoElement(
  video: HTMLVideoElement | null,
  time: number,
  durationFallback = 0,
): void {
  if (!video) return;
  const d =
    Number.isFinite(video.duration) && video.duration > 0
      ? video.duration
      : durationFallback;
  video.currentTime = mobileLayoutService.clamp(
    time,
    0,
    Math.max(0.01, d || 0),
  );
  commitPlayheadTime(video.currentTime);
}

/**
 * Stable seek callback for a page-owned video ref: clamps to `[0, duration]`
 * and commits to the playhead clock. Single copy; was `useSeekTo` in
 * `cut/useCutPlayback`.
 */
export function useSeekTo(
  videoRef: RefObject<HTMLVideoElement | null>,
  duration: number,
) {
  return useCallback(
    (t: number) => {
      const v = videoRef.current;
      if (!v) return;
      seekVideoElement(v, t, duration);
    },
    [duration, videoRef],
  );
}

/**
 * Single playback engine for every editor page.
 *
 * Owns the video-element transport state: play/pause/timeupdate/seeked/
 * ended/loadedmetadata listeners (attached once per media), the isolated
 * playhead clock (transient per-frame ticks + committed seeks), trim
 * clamping (unconditional loop via `loopRange`, or loop-vs-pause-at-end via
 * `trimRange`/`trimLoop`), and volume/muted/rate/loop element sync plus
 * WebAudio preview tracks.
 *
 * Pages keep their own domain logic (cut play-all jumping, canvas sync,
 * subtitle cue filtering) and drive shared controls from this result.
 * `cut/useCutPlayback` is a thin wrapper over this hook.
 */
export function usePlaybackEngine(
  videoRef: RefObject<HTMLVideoElement | null>,
  options: UsePlaybackEngineOptions = {},
): UsePlaybackEngineResult {
  const {
    loopRange = null,
    trimRange = null,
    trimLoop = false,
    throttleMs = 0,
    onTime,
    onMetadata,
    onEnded,
  } = options;
  const mediaUrl = options.mediaUrl ?? null;

  // Narrow subscriptions: the playhead ticks at frame rate in its own
  // isolated store so sourceStore subscribers never re-render while playing.
  const file = useSelector(sourceStore, (s) => s.file);
  const isPlaying = useSelector(sourceStore, (s) => s.isPlaying);
  const duration = useSelector(sourceStore, (s) => s.duration);
  const volume = useSelector(sourceStore, (s) => s.volume);
  const muted = useSelector(sourceStore, (s) => s.isMuted);
  const currentTime = usePlayheadTime();
  const loop = useSelector(mobileStore, (s) => s.isLoopEnabled);
  const playbackSpeed = useSelector(cutStore, (s) => s.playbackSpeed);
  const trackCount = useSelector(audioStore, (s) => s.tracks.length);
  const tracks = useSelector(audioStore, (s) => s.tracks);
  useAudioPreview({ file, mediaUrl, videoRef, tracks, volume, muted });

  const timeRef = useRef(0);
  const lastTickRef = useRef(0);

  // Latest-callback refs so element listeners stay stable.
  const loopRangeRef = useRef(loopRange);
  const trimRangeRef = useRef(trimRange);
  const trimLoopRef = useRef(trimLoop);
  const throttleRef = useRef(throttleMs);
  const onTimeRef = useRef(onTime);
  const onMetadataRef = useRef(onMetadata);
  const onEndedRef = useRef(onEnded);
  useEffect(() => {
    loopRangeRef.current = loopRange;
    trimRangeRef.current = trimRange;
    trimLoopRef.current = trimLoop;
    throttleRef.current = throttleMs;
    onTimeRef.current = onTime;
    onMetadataRef.current = onMetadata;
    onEndedRef.current = onEnded;
  }, [loopRange, trimRange, trimLoop, throttleMs, onTime, onMetadata, onEnded]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    // Transient tick: isolated playhead only, so sourceStore subscribers
    // (headers, panels, lists) never re-render while the video plays.
    const pushTime = (t: number) => {
      timeRef.current = t;
      const now = performance.now();
      if (
        throttleRef.current <= 0 ||
        now - lastTickRef.current >= throttleRef.current
      ) {
        lastTickRef.current = now;
        setPlayheadTime(t);
      }
    };

    const jumpTo = (t: number) => {
      v.currentTime = t;
      timeRef.current = t;
      lastTickRef.current = performance.now();
      commitPlayheadTime(t);
    };

    // Committed clamp: loop jumps and pause-at-end are seeks — keep the
    // source snapshot in sync for handlers without a video element.
    // Returns true when the tick was fully handled (caller still runs
    // onTime, but must skip the normal pushTime).
    const clampToWindow = () => {
      const loopWindow = loopRangeRef.current;
      if (loopWindow && loopWindow[1] > loopWindow[0]) {
        const [s, e] = loopWindow;
        if (e > s && (v.currentTime >= e - 0.02 || v.currentTime < s - 0.01)) {
          jumpTo(s);
          return true;
        }
        return false;
      }
      const trim = trimRangeRef.current;
      if (!trim || !(trim[1] > trim[0])) return false;
      const [s, e] = trim;
      if (trimLoopRef.current) {
        if (v.currentTime >= e - 0.02 || v.currentTime < s - 0.01) {
          jumpTo(s);
          return true;
        }
        return false;
      }
      // Pause-at-end policy (subtitles when looping is off).
      if (v.currentTime >= e - 0.01 && e > 0) {
        v.pause();
        v.currentTime = e;
        timeRef.current = e;
        commitPlayheadTime(e);
        setSourceState((previous) => ({ ...previous, isPlaying: false }));
        return true;
      }
      if (v.currentTime < s - 0.01) {
        jumpTo(s);
        return true;
      }
      return false;
    };

    const onTimeUpdate = () => {
      if (clampToWindow()) {
        onTimeRef.current?.(v);
        return;
      }
      pushTime(v.currentTime);
      onTimeRef.current?.(v);
    };
    // Seeks are committed (snapshot + transient); in-between frames stay
    // transient so scrubbing doesn't spam the global store either.
    const onSeeked = () => {
      if (clampToWindow()) {
        onTimeRef.current?.(v);
        return;
      }
      timeRef.current = v.currentTime;
      commitPlayheadTime(v.currentTime);
      onTimeRef.current?.(v);
    };
    // Smooth sync while playing: `timeupdate` alone fires ~4Hz, leaving the
    // seek slider, trim marker and audio-waveform playheads steppy and out
    // of sync. The rAF loop keeps the live ref fresh every frame and commits
    // throttled snapshots for rendering. Only enabled when a throttle is
    // configured so throttle-0 consumers keep their exact behavior.
    let animationFrame = 0;
    const tick = () => {
      if (!clampToWindow()) pushTime(v.currentTime);
      onTimeRef.current?.(v);
      animationFrame = requestAnimationFrame(tick);
    };
    const startSync = () => {
      cancelAnimationFrame(animationFrame);
      animationFrame = 0;
      if (throttleRef.current > 0 && !v.paused) tick();
    };
    const stopSync = () => {
      cancelAnimationFrame(animationFrame);
      animationFrame = 0;
    };
    const onPlay = () => {
      setSourceState((previous) => ({ ...previous, isPlaying: true }));
      startSync();
    };
    const onPause = () => {
      stopSync();
      // Commit the resting playhead so store-only readers see the pause spot.
      commitPlayheadTime(timeRef.current || v.currentTime);
      setSourceState((previous) => ({ ...previous, isPlaying: false }));
    };
    const restartAt = (t: number) => {
      jumpTo(t);
      v.play().catch(NOOP);
    };
    const onEndedNative = () => {
      stopSync();
      if (onEndedRef.current) {
        onEndedRef.current(v);
        return;
      }
      const loopWindow = loopRangeRef.current;
      if (loopWindow && loopWindow[1] > loopWindow[0]) {
        restartAt(loopWindow[0]);
        return;
      }
      const trim = trimRangeRef.current;
      if (trim && trim[1] > trim[0] && trimLoopRef.current) {
        restartAt(trim[0]);
        return;
      }
      setSourceState((previous) => ({ ...previous, isPlaying: false }));
    };
    const onMeta = () => {
      const d = v.duration;
      if (Number.isFinite(d))
        setSourceState((previous) => ({ ...previous, duration: d }));
      onMetadataRef.current?.(v);
    };

    v.addEventListener("timeupdate", onTimeUpdate, {
      passive: true,
    } as AddEventListenerOptions);
    v.addEventListener("seeked", onSeeked);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("ended", onEndedNative);
    v.addEventListener("loadedmetadata", onMeta);
    if (Number.isFinite(v.duration) && v.duration > 0)
      setSourceState((previous) => ({ ...previous, duration: v.duration }));
    if (!v.paused) startSync();
    return () => {
      stopSync();
      v.removeEventListener("timeupdate", onTimeUpdate);
      v.removeEventListener("seeked", onSeeked);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("ended", onEndedNative);
      v.removeEventListener("loadedmetadata", onMeta);
    };
  }, [videoRef, mediaUrl]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.volume = volume;
  }, [volume, videoRef, mediaUrl]);

  useEffect(() => {
    // While WebAudio preview tracks exist the element itself stays muted so
    // audio isn't doubled.
    if (videoRef.current)
      videoRef.current.muted = trackCount > 0 ? true : muted;
  }, [muted, trackCount, videoRef, mediaUrl]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = playbackSpeed;
  }, [playbackSpeed, videoRef, mediaUrl]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.loop = loop;
  }, [loop, videoRef, mediaUrl]);

  const setVolume = useCallback((v: number) => {
    const next = mobileLayoutService.clamp(v, 0, 1);
    setSourceState((previous) => ({
      ...previous,
      volume: next,
      isMuted: next > 0 ? false : previous.isMuted,
    }));
  }, []);

  const setMuted = useCallback((next: boolean) => {
    setSourceState((previous) => ({ ...previous, isMuted: next }));
  }, []);
  const toggleMute = useCallback(() => {
    setSourceState((previous) => ({ ...previous, isMuted: !previous.isMuted }));
  }, []);
  const setLoop = useCallback((next: boolean) => {
    setMobileState((previous) => ({ ...previous, isLoopEnabled: next }));
  }, []);
  const toggleLoop = useCallback(() => {
    setMobileState((previous) => ({
      ...previous,
      isLoopEnabled: !previous.isLoopEnabled,
    }));
  }, []);

  const play = useCallback(() => {
    videoRef.current
      ?.play()
      .catch(() =>
        setSourceState((previous) => ({ ...previous, isPlaying: false })),
      );
  }, [videoRef]);

  const pause = useCallback(() => {
    videoRef.current?.pause();
  }, [videoRef]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused)
      v.play().catch(() =>
        setSourceState((previous) => ({ ...previous, isPlaying: false })),
      );
    else v.pause();
  }, [videoRef]);

  const seekTo = useCallback(
    (t: number) => {
      const v = videoRef.current;
      if (!v) return;
      seekVideoElement(v, t, timeRef.current);
      timeRef.current = v.currentTime;
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
