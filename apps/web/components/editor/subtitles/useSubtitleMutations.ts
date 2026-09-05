"use client";

import { useCallback, useTransition } from "react";
import { useVideoStore } from "@/store/useVideoStore";
import { clamp } from "@/lib/mobile-layout";
import type { Subtitle, SubtitleStyle } from "@/lib/subtitles/subtitleTypes";
import { DEFAULT_SUBTITLE_STYLE } from "@/lib/subtitles/subtitleDefaults";
import { MIN_SUBTITLE_DURATION } from "@/lib/subtitles/subtitleDefaults";
import { findFirstFreeTrack, generateId } from "./subtitle-helpers";

type VideoStore = ReturnType<typeof useVideoStore>;

export type UseSubtitleMutationsArgs = {
  videoStore: VideoStore;
  selectedId: string | null;
  hasVideo: boolean;
  effectiveDuration: number;
  currentTime: number;
  trimStart: number;
  trimEnd: number;
  trackCountExplicit: number;
  trackCount: number;
};

// Memoized store updaters + subtitle mutations — rerender-functional-setstate
// for stable callbacks, non-urgent updates in transitions.
export function useSubtitleMutations({
  videoStore,
  selectedId,
  hasVideo,
  effectiveDuration,
  currentTime,
  trimStart,
  trimEnd,
  trackCountExplicit,
  trackCount,
}: UseSubtitleMutationsArgs) {
  // Transitions for non-urgent updates — rerender-transitions + rendering-usetransition-loading
  const [isPending, startTransition] = useTransition();
  void isPending;

  // Memoized store updaters — rerender-functional-setstate for stable callbacks
  const setSubtitles = useCallback(
    (updater: Subtitle[] | ((prev: Subtitle[]) => Subtitle[])) => {
      startTransition(() => {
        videoStore.setState((prev) => {
          const p = prev as unknown as { subtitles?: Subtitle[] };
          const cur = p.subtitles ?? [];
          return {
            ...prev,
            subtitles:
              typeof updater === "function"
                ? (updater as (x: Subtitle[]) => Subtitle[])(cur)
                : updater,
          };
        });
      });
    },
    [videoStore],
  );
  const setSelectedId = useCallback(
    (id: string | null | ((prev: string | null) => string | null)) => {
      videoStore.setState((prev) => {
        const p = prev as unknown as { selectedSubtitleId?: string | null };
        const cur = p.selectedSubtitleId ?? null;
        return {
          ...prev,
          selectedSubtitleId:
            typeof id === "function"
              ? (id as (x: string | null) => string | null)(cur)
              : id,
        };
      });
    },
    [videoStore],
  );
  const setTrackCountExplicit = useCallback(
    (value: number | ((prev: number) => number)) => {
      videoStore.setState((prev) => {
        const p = prev as unknown as { subtitleTrackCountExplicit?: number };
        const cur = p.subtitleTrackCountExplicit ?? 1;
        return {
          ...prev,
          subtitleTrackCountExplicit:
            typeof value === "function"
              ? (value as (x: number) => number)(cur)
              : value,
        };
      });
    },
    [videoStore],
  );

  // Keep selected update stable — rerender-functional-setstate + useTransition
  const updateSubtitle = useCallback(
    (id: string, patch: Partial<Subtitle> | ((s: Subtitle) => Subtitle)) => {
      startTransition(() => {
        setSubtitles((prev) =>
          prev.map((s) => {
            if (s.id !== id) return s;
            if (typeof patch === "function")
              return (patch as (x: Subtitle) => Subtitle)(s);
            return { ...s, ...patch };
          }),
        );
      });
    },
    [setSubtitles],
  );

  const updateSelectedStyle = useCallback(
    (patch: Partial<SubtitleStyle>) => {
      if (!selectedId) return;
      const sid = selectedId;
      startTransition(() => {
        setSubtitles((prev) =>
          prev.map((s) =>
            s.id === sid ? { ...s, style: { ...s.style, ...patch } } : s,
          ),
        );
      });
    },
    [selectedId, setSubtitles],
  );

  const handleAddSubtitle = useCallback(() => {
    if (!hasVideo || effectiveDuration === 0) return;
    const t = clamp(
      currentTime,
      trimStart,
      Math.max(trimStart, trimEnd - MIN_SUBTITLE_DURATION),
    );
    const start = clamp(t, trimStart, trimEnd - MIN_SUBTITLE_DURATION);
    const end = clamp(start + 1, start + MIN_SUBTITLE_DURATION, trimEnd);
    const id = generateId();
    setSubtitles((prev) => {
      const track = findFirstFreeTrack(prev, start, end);
      const newSub: Subtitle = {
        id,
        text: "New subtitle",
        startTime: start,
        endTime: end,
        track,
        position: { x: 50, y: 80 },
        style: { ...DEFAULT_SUBTITLE_STYLE },
      };
      if (track + 1 > trackCountExplicit) {
        setTrackCountExplicit(track + 1);
      }
      return [...prev, newSub];
    });
    setSelectedId(id);
  }, [
    hasVideo,
    effectiveDuration,
    currentTime,
    trimStart,
    trimEnd,
    trackCountExplicit,
    setSubtitles,
    setSelectedId,
    setTrackCountExplicit,
  ]);

  const handleDeleteSubtitle = useCallback(() => {
    if (!selectedId) return;
    const sid = selectedId;
    setSubtitles((prev) => {
      const idx = prev.findIndex((s) => s.id === sid);
      const next = prev.filter((s) => s.id !== sid);
      if (next.length === 0) setSelectedId(null);
      else {
        const newIdx = Math.min(idx, next.length - 1);
        setSelectedId(next[newIdx].id);
      }
      return next;
    });
  }, [selectedId, setSubtitles, setSelectedId]);

  const handleMoveSubtitleToTrack = useCallback(
    (id: string, newTrack: number) => {
      const t = clamp(Math.round(newTrack), 0, 99);
      if (t >= trackCount) {
        setTrackCountExplicit(t + 1);
      }
      startTransition(() => {
        setSubtitles((prev) =>
          prev.map((s) => (s.id === id ? { ...s, track: t } : s)),
        );
      });
    },
    [trackCount, setTrackCountExplicit, setSubtitles],
  );

  const handleAddTrack = useCallback(() => {
    setTrackCountExplicit((c) => c + 1);
  }, [setTrackCountExplicit]);

  const handleTimelineUpdateSubtitle = useCallback(
    (id: string, ns: number, ne: number) => {
      const d = effectiveDuration;
      let s = clamp(ns, trimStart, trimEnd - MIN_SUBTITLE_DURATION);
      let e = clamp(ne, s + MIN_SUBTITLE_DURATION, trimEnd);
      if (s < 0) s = 0;
      if (e > d) e = d;
      if (e - s < MIN_SUBTITLE_DURATION) return;
      startTransition(() => {
        setSubtitles((prev) =>
          prev.map((sub) =>
            sub.id === id ? { ...sub, startTime: s, endTime: e } : sub,
          ),
        );
      });
    },
    [effectiveDuration, trimStart, trimEnd, setSubtitles],
  );

  return {
    setSubtitles,
    setSelectedId,
    setTrackCountExplicit,
    updateSubtitle,
    updateSelectedStyle,
    handleAddSubtitle,
    handleDeleteSubtitle,
    handleMoveSubtitleToTrack,
    handleAddTrack,
    handleTimelineUpdateSubtitle,
  };
}
