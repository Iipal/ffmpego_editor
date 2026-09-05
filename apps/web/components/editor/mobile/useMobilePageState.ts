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
  clamp,
  createDefaultLayout,
  loadPrefForMode,
  validateLayout,
  OUTPUT_H,
  OUTPUT_W,
} from "@/lib/mobile-layout";
import { useMobileEditor } from "./useMobileEditor";
import { useVideoPlayer } from "@/components/editor/shared/useVideoPlayer";
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
  const trimStart = trimRange[0];
  const trimEnd = trimRange[1];
  const trimmedDuration = useMemo(
    () => Math.max(0, trimEnd - trimStart),
    [trimStart, trimEnd],
  );

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

  const setTrimRange = useCallback(
    (
      updater:
        | [number, number]
        | ((prev: [number, number]) => [number, number]),
    ) => {
      startTransition(() => {
        videoStore.setState((prev) => ({
          ...prev,
          trimRange:
            typeof updater === "function"
              ? (updater as (p: [number, number]) => [number, number])(
                  prev.trimRange,
                )
              : updater,
        }));
      });
    },
    [videoStore, startTransition],
  );

  useEffect(() => {
    if (duration <= 0) return;
    if (trimRange[1] === 0) {
      videoStore.setState((prev) =>
        prev.trimRange[1] === 0
          ? { ...prev, trimRange: [0, duration] as [number, number] }
          : prev,
      );
    } else if (trimRange[1] > duration) {
      videoStore.setState((prev) => ({
        ...prev,
        trimRange: [Math.min(prev.trimRange[0], duration - 0.2), duration] as [
          number,
          number,
        ],
      }));
    }
  }, [duration, trimRange, videoStore]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onMeta = () => {
      const d = v.duration;
      if (Number.isFinite(d)) {
        ed.setDuration(d);
        videoStore.setState((prev) => {
          if (prev.trimRange[1] === 0 || prev.trimRange[1] > d)
            return {
              ...prev,
              trimRange: [0, d] as [number, number],
            } as typeof prev;
          return prev;
        });
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
    setTrimRange(([s, e]) => {
      const ns = clamp(t, 0, e - 0.2);
      if (videoRef.current && isLoopTrim) videoRef.current.currentTime = ns;
      return [ns, e];
    });
  }, [currentTime, isLoopTrim, setTrimRange]);

  const setEndToCurrent = useCallback(() => {
    const t = videoRef.current?.currentTime ?? currentTime;
    setTrimRange(([s]) => {
      const dur = duration || 30;
      const ne = clamp(t, s + 0.2, dur);
      return [s, ne];
    });
  }, [currentTime, duration, setTrimRange]);

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
