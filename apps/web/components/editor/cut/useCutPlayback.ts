"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { toast } from "sonner";
import { clamp } from "@/lib/mobile-layout";
import { useVideoStore } from "@/store/useVideoStore";
import { useVideoPlayer } from "@/components/editor/shared/useVideoPlayer";
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
  const [playAll, setPlayAll] = useState(false);

  // Refs so the shared hook's stable tick handler always sees latest cuts.
  const playAllRef = useRef(playAll);
  const sortedRef = useRef(sorted);
  useEffect(() => {
    playAllRef.current = playAll;
    sortedRef.current = sorted;
  }, [playAll, sorted]);

  const player = useVideoPlayer(videoRef, {
    onTime: (v) => {
      if (!playAllRef.current || sortedRef.current.length === 0) return;
      const cuts = sortedRef.current;
      const idx = cuts.findIndex(
        (c) =>
          v.currentTime >= c.start - 0.05 && v.currentTime < c.end - 0.02,
      );
      if (idx === -1) {
        const next = cuts.find((c) => c.start > v.currentTime + 0.02);
        if (next) v.currentTime = next.start;
        else {
          setPlayAll(false);
          v.pause();
        }
      }
    },
    onMetadata: (v) => {
      const d = v.duration;
      if (Number.isFinite(d)) {
        videoStore.setState((prev) =>
          prev.duration !== d
            ? ({ ...prev, duration: d } as typeof prev)
            : prev,
        );
      }
    },
  });

  // Pausing (including play-all finishing) exits play-all mode.
  const { isPlaying } = player;
  useEffect(() => {
    if (!isPlaying) setPlayAll(false);
  }, [isPlaying]);

  const togglePlay = player.togglePlay;

  const playCut = useCallback(
    (cut: Cut) => {
      setPlayAll(false);
      seekTo(cut.start + 0.01);
      videoRef.current?.play().catch(() => {});
    },
    [seekTo, videoRef],
  );

  const playAllCuts = useCallback(() => {
    if (sortedRef.current.length === 0) {
      toast.error("Add at least one cut first");
      return;
    }
    setPlayAll(true);
    seekTo(sortedRef.current[0].start + 0.01);
    videoRef.current?.play().catch(() => {});
  }, [seekTo, videoRef]);

  void mediaUrl;
  void duration;

  return {
    currentTime: player.currentTime,
    isPlaying: player.isPlaying,
    playAll,
    volume: player.volume,
    setVolume: player.setVolume,
    muted: player.muted,
    toggleMute: player.toggleMute,
    loop: player.loop,
    toggleLoop: player.toggleLoop,
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
