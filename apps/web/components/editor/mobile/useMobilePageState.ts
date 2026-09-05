"use client";

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useVideoState, useVideoStore } from "@/store/useVideoStore";
import { formatTime } from "@/lib/format-time";
import {
  createDefaultLayout,
  loadPrefForMode,
  validateLayout,
  OUTPUT_H,
  OUTPUT_W,
} from "@/lib/mobile-layout";
import { useMobileEditor } from "./useMobileEditor";
import { useVideoPlayer } from "@/components/editor/shared/useVideoPlayer";
import {
  TRIM_MIN_GAP_DEFAULT,
  useTrimRange,
} from "@/components/editor/shared/useTrimRange";
import { useMobileLayoutActions } from "./useMobileLayoutActions";
import { cachedBuildMobileFilter, ensureAppInitOnce, NOOP } from "./mobile-helpers";

export function useMobilePageState() {
  useEffect(() => {
    ensureAppInitOnce();
  }, []);

  const { file, mediaUrl, uploadStatus } = useVideoState() as unknown as {
    file: File | null;
    mediaUrl: string | null;
    uploadStatus: string;
  };
  const { duration: srcDuration, sourceWidth, sourceHeight, trimRange } =
    useVideoState() as unknown as {
      duration: number;
      sourceWidth: number;
      sourceHeight: number;
      trimRange: [number, number];
    };
  const videoStore = useVideoStore();
  const ed = useMobileEditor();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPending, startTransition] = useTransition();
  const [isLoopTrim, setIsLoopTrim] = useState(false);

  // Shared transport state: play/pause/seek/volume/mute + trim-loop window.
  // currentTime snapshot is throttled to 10 Hz (same cadence as before);
  // handlers read the live video element directly.
  const {
    togglePlay,
    seekTo,
    isPlaying,
    volume,
    setVolume,
    muted,
    setMuted,
    currentTime,
  } = useVideoPlayer(videoRef, {
    loopRange: isLoopTrim ? trimRange : null,
    throttleMs: 100,
  });

  const hasVideo = !!mediaUrl && !!file;
  const duration = ed.duration || srcDuration || 0;

  // Shared trim-range state: store tuple, init/clamp on duration, clamped
  // commits, set-start/end-to-time helpers.
  const {
    trimStart,
    trimEnd,
    trimmedDuration,
    setTrimRange,
    setStartToCurrentTime,
    setEndToCurrentTime,
  } = useTrimRange({
    duration,
    minGap: TRIM_MIN_GAP_DEFAULT,
    overshoot: "reset",
  });

  const validationError = useMemo(() => {
    if (ed.layout.zones.length === 0) return "No zones";
    return validateLayout(ed.layout);
  }, [ed.layout]);

  const filterString = useMemo(
    () =>
      cachedBuildMobileFilter(
        ed.layout,
        sourceWidth || 1920,
        sourceHeight || 1080,
        ed.layout.splitRatio,
      ),
    [ed.layout, sourceWidth, sourceHeight],
  );
  const defferedFilter = useDeferredValue(filterString);
  const isFilterStale = filterString !== defferedFilter;

  const actions = useMobileLayoutActions(ed, startTransition);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onMeta = () => {
      const d = v.duration;
      if (Number.isFinite(d)) {
        ed.setDuration(d);
      }
    };
    v.addEventListener("loadedmetadata", onMeta);
    return () => v.removeEventListener("loadedmetadata", onMeta);
  }, [mediaUrl, videoStore, ed]);

  const handleSeekStart = useCallback(() => {
    if (!duration) return;
    seekTo(trimStart);
    if (!isPlaying) videoRef.current?.play().catch(NOOP);
  }, [duration, trimStart, seekTo, isPlaying]);

  const handleResetAll = useCallback(() => {
    const saved = loadPrefForMode(ed.layout.mode);
    if (saved) ed.setLayout(saved);
    else ed.setLayout(createDefaultLayout(ed.layout.mode, 0.5));
    if (duration > 0) setTrimRange([0, duration]);
    setVolume(1);
    setMuted(false);
    setIsLoopTrim(false);
  }, [ed, duration, setTrimRange, setVolume, setMuted]);

  const setStartToCurrent = useCallback(() => {
    const t = videoRef.current?.currentTime ?? currentTime;
    const ns = setStartToCurrentTime(t);
    if (videoRef.current && isLoopTrim) videoRef.current.currentTime = ns;
  }, [currentTime, isLoopTrim, setStartToCurrentTime]);

  const setEndToCurrent = useCallback(() => {
    const t = videoRef.current?.currentTime ?? currentTime;
    setEndToCurrentTime(t);
  }, [currentTime, setEndToCurrentTime]);

  const fileName = file?.name ?? "";
  const sourceLabel =
    sourceWidth && sourceHeight ? `${sourceWidth} × ${sourceHeight} px` : "—";
  const outputLabel = `${OUTPUT_W} × ${OUTPUT_H} px`;
  const splitLabel = `${Math.round(ed.layout.splitRatio * 100)} / ${Math.round((1 - ed.layout.splitRatio) * 100)}`;
  const modeBadge =
    ed.layout.mode === "full" ? "Full 9:16" : `Stacked ${splitLabel}`;
  const trimLabel = ed.ignoreTrim
    ? duration
      ? `Full length · ${formatTime(duration)}`
      : "Full length"
    : duration
      ? `${formatTime(trimStart)} → ${formatTime(trimEnd)} · ${formatTime(trimmedDuration)}`
      : "—";

  void OUTPUT_H;

  return {
    ed,
    videoRef,
    videoStore,
    file,
    fileName,
    mediaUrl,
    uploadStatus,
    hasVideo,
    duration,
    srcDuration,
    sourceWidth,
    sourceHeight,
    trimRange,
    trimStart,
    trimEnd,
    trimmedDuration,
    validationError,
    filterString,
    defferedFilter,
    isFilterStale,
    isPending,
    volume,
    setVolume,
    isMuted: muted,
    setIsMuted: setMuted,
    isLoopTrim,
    setIsLoopTrim,
    isPlaying,
    currentTime,
    sourceLabel,
    outputLabel,
    splitLabel,
    modeBadge,
    trimLabel,
    setTrimRange,
    togglePlay,
    seekTo,
    ...actions,
    setStartToCurrent,
    setEndToCurrent,
    handleSeekStart,
    handleResetAll,
  };
}

export type MobilePageState = ReturnType<typeof useMobilePageState>;
