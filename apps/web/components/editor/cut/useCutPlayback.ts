"use client";

import { useCallback, useEffect, useState } from "react";
import type { RefObject } from "react";
import { toast } from "sonner";
import { clamp } from "@/lib/mobile-layout";
import { useVideoStore } from "@/store/useVideoStore";
import type { Cut } from "./types";

type VideoStore = ReturnType<typeof useVideoStore>;

export function useCutPlayback({
  videoRef,
  mediaUrl,
  videoStore,
  duration,
  sorted,
  seekTo,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  mediaUrl: string | null;
  videoStore: VideoStore;
  duration: number;
  sorted: Cut[];
  seekTo: (t: number) => void;
}) {
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playAll, setPlayAll] = useState(false);
  const [volume, setVolume] = useState(1);

  // Keep video element in sync: time updates, play-all-cuts preview jumping
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => {
      setCurrentTime(v.currentTime);
      if (playAll && sorted.length > 0) {
        const idx = sorted.findIndex(
          (c) =>
            v.currentTime >= c.start - 0.05 && v.currentTime < c.end - 0.02,
        );
        if (idx === -1) {
          const next = sorted.find((c) => c.start > v.currentTime + 0.02);
          if (next) v.currentTime = next.start;
          else {
            setPlayAll(false);
            v.pause();
          }
        }
      }
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => {
      setIsPlaying(false);
      setPlayAll(false);
    };
    const onMeta = () => {
      const d = v.duration;
      if (Number.isFinite(d)) {
        videoStore.setState((prev) =>
          prev.duration !== d
            ? ({ ...prev, duration: d } as typeof prev)
            : prev,
        );
      }
    };
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("seeked", onTime);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("loadedmetadata", onMeta);
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("seeked", onTime);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("loadedmetadata", onMeta);
    };
  }, [mediaUrl, playAll, sorted, videoStore, videoRef]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.volume = volume;
  }, [volume, videoRef]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (isPlaying) v.pause();
    else v.play().catch(() => {});
  }, [isPlaying, videoRef]);

  const playCut = useCallback(
    (cut: Cut) => {
      setPlayAll(false);
      seekTo(cut.start + 0.01);
      videoRef.current?.play().catch(() => {});
    },
    [seekTo, videoRef],
  );

  const playAllCuts = useCallback(() => {
    if (sorted.length === 0) {
      toast.error("Add at least one cut first");
      return;
    }
    setPlayAll(true);
    seekTo(sorted[0].start + 0.01);
    videoRef.current?.play().catch(() => {});
  }, [sorted, seekTo, videoRef]);

  return {
    currentTime,
    isPlaying,
    playAll,
    volume,
    setVolume,
    togglePlay,
    playCut,
    playAllCuts,
  };
}

export function useSeekTo(
  videoRef: RefObject<HTMLVideoElement | null>,
  duration: number,
) {
  const seekTo = useCallback(
    (t: number) => {
      const v = videoRef.current;
      if (!v) return;
      v.currentTime = clamp(t, 0, Math.max(0.01, v.duration || duration || 0));
    },
    [duration, videoRef],
  );
  return seekTo;
}
