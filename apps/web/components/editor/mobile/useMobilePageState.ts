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
import { useSelector } from "@tanstack/react-store";
import { sourceStore, setSourceState } from "@/store/sourceSlice";
import { formatTime } from "@/lib/format-time";
import { MobileLayoutService, mobileLayoutService } from "@/lib/mobile-layout";
import { useMobileEditor } from "./useMobileEditor";
import { usePlaybackEngine } from "@/components/editor/shared/usePlaybackEngine";
import { useMobileLayoutActions } from "./useMobileLayoutActions";
import { NOOP } from "@/lib/utils";
import { initAppOnce } from "@/lib/heavy";
import { apiBaseUrl } from "@/lib/query-hooks";

export function useMobilePageState() {
  useEffect(() => {
    initAppOnce("mobile", [apiBaseUrl()]);
  }, []);

  const file = useSelector(sourceStore, (s) => s.file);
  const mediaUrl = useSelector(sourceStore, (s) => s.mediaUrl);
  const uploadStatus = useSelector(sourceStore, (s) => s.uploadStatus);
  const srcDuration = useSelector(sourceStore, (s) => s.duration);
  const sourceWidth = useSelector(sourceStore, (s) => s.sourceWidth);
  const sourceHeight = useSelector(sourceStore, (s) => s.sourceHeight);
  const trimRange = useSelector(sourceStore, (s) => s.trimRange);
  const ed = useMobileEditor();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPending, startTransition] = useTransition();
  const [isLoopTrim, setIsLoopTrim] = useState(false);

  // Shared transport state: play/pause/seek/volume/mute + trim-loop window.
  // currentTime snapshot is throttled to 20 Hz and driven by a rAF loop
  // while playing (same cadence family as the crop player); handlers read
  // the live video element directly.
  const {
    togglePlay,
    seekTo,
    isPlaying,
    volume,
    setVolume,
    muted,
    setMuted,
    currentTime,
  } = usePlaybackEngine(videoRef, {
    mediaUrl,
    loopRange: isLoopTrim ? trimRange : null,
    throttleMs: 50,
  });

  const hasVideo = !!mediaUrl && !!file;
  const duration = ed.duration || srcDuration || 0;

  // Trim-range state is owned by the self-owned TrimControls card
  // (useTrimRange inside it); read the shared tuple here for labels, loop
  // window and export.
  const trimStart = trimRange[0];
  const trimEnd = trimRange[1];
  const trimmedDuration = Math.max(0, trimEnd - trimStart);

  const validationError = useMemo(() => {
    if (ed.layout.zones.length === 0) return "No zones";
    return mobileLayoutService.validateLayout(ed.layout);
  }, [ed.layout]);

  const filterString = useMemo(
    () =>
      mobileLayoutService.buildMobileFilter(
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

  const setDuration = ed.setDuration;
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onMeta = () => {
      const d = v.duration;
      if (Number.isFinite(d)) {
        setDuration(d);
      }
    };
    v.addEventListener("loadedmetadata", onMeta);
    return () => v.removeEventListener("loadedmetadata", onMeta);
  }, [mediaUrl, setDuration]);

  const handleSeekStart = useCallback(() => {
    if (!duration) return;
    seekTo(trimStart);
    if (!isPlaying) videoRef.current?.play().catch(NOOP);
  }, [duration, trimStart, seekTo, isPlaying]);

  const layoutMode = ed.layout.mode;
  const setLayout = ed.setLayout;
  const handleResetAll = useCallback(() => {
    const saved = mobileLayoutService.loadPrefForMode(layoutMode);
    if (saved) setLayout(saved);
    else setLayout(mobileLayoutService.createDefaultLayout(layoutMode, 0.5));
    if (duration > 0) {
      const next: [number, number] = [0, duration];
      setSourceState((prev) => ({ ...prev, trimRange: next }));
    }
    setVolume(1);
    setMuted(false);
    setIsLoopTrim(false);
  }, [layoutMode, setLayout, duration, setVolume, setMuted]);

  const fileName = file?.name ?? "";
  const sourceLabel =
    sourceWidth && sourceHeight ? `${sourceWidth} × ${sourceHeight} px` : "—";
  const outputLabel = `${MobileLayoutService.OUTPUT_W} × ${MobileLayoutService.OUTPUT_H} px`;
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

  return {
    ed,
    videoRef,
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
    togglePlay,
    seekTo,
    ...actions,
    handleSeekStart,
    handleResetAll,
  };
}

export type MobilePageState = ReturnType<typeof useMobilePageState>;
