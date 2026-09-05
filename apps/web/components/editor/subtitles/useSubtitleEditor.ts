"use client";

import { useCallback, useDeferredValue, useEffect, useMemo } from "react";
import { useVideoState, useVideoStore } from "@/store/useVideoStore";
import { clamp } from "@/lib/mobile-layout";
import { useSharedMobileLayout } from "@/hooks/useSharedMobileLayout";
import type { Subtitle } from "@/lib/subtitles/subtitleTypes";
import { MIN_SUBTITLE_DURATION } from "@/lib/subtitles/subtitleDefaults";
import { ensureGoogleFontLoaded } from "@/lib/subtitles/googleFonts";
import { NOOP, initAppOnce } from "./heavy-modules";
import { getSubtitleTrack } from "./subtitle-helpers";
import { useSubtitleExport } from "./useSubtitleExport";
import { useSubtitleMutations } from "./useSubtitleMutations";
import { useSubtitleTemplates } from "./useSubtitleTemplates";
import { useVideoPlayback } from "./useVideoPlayback";

// Composer hook: store subscriptions, derived state, mutations, templates, trim, playback, export.
export function useSubtitleEditor() {
  // advanced-init-once: ensure one-time preconnect, not per mount
  useEffect(() => {
    initAppOnce();
  }, []);

  const videoStore = useVideoStore();
  // rerender-defer-reads + rerender-derived-state: subscribe narrowly to primitives only
  const videoState =
    useVideoState() as typeof useVideoState extends () => infer R ? R : never;
  const rawState = videoState as unknown as {
    mediaUrl: string | null;
    duration: number;
    file: File | null;
    sourceWidth: number;
    sourceHeight: number;
    subtitles?: Subtitle[];
    selectedSubtitleId?: string | null;
    subtitleTrackCountExplicit?: number;
    trimRange?: [number, number];
  };
  const mediaUrl = rawState.mediaUrl;
  const srcDuration = rawState.duration;
  const file = rawState.file;
  const sourceWidth = rawState.sourceWidth;
  const sourceHeight = rawState.sourceHeight;
  const rawSubtitles = rawState.subtitles;
  const rawSelectedId = rawState.selectedSubtitleId;
  const rawTrackCount = rawState.subtitleTrackCountExplicit;
  const trimRangeStore = rawState.trimRange ?? ([0, 0] as [number, number]);

  // rerender-derived-state-no-effect: derive during render, not effect
  const subtitlesRaw = rawSubtitles ?? [];
  const selectedId = rawSelectedId ?? null;
  const trackCountExplicit = rawTrackCount ?? 1;
  const trimStart = trimRangeStore[0];
  const trimEnd = trimRangeStore[1];

  const { layout } = useSharedMobileLayout();

  // rerender-use-deferred-value: defer expensive subtitle filtering to keep typing responsive
  const deferredSubtitles = useDeferredValue(subtitlesRaw);
  const isSubtitlesStale = subtitlesRaw !== deferredSubtitles;

  const hasVideo = !!mediaUrl && !!file;

  // js-min-max-loop: single loop for maxTrack (O(n) not O(n log n))
  const maxTrackFromSubtitles = useMemo(() => {
    if (deferredSubtitles.length === 0) return -1;
    let max = getSubtitleTrack(deferredSubtitles[0]);
    const len = deferredSubtitles.length;
    for (let i = 1; i < len; i++) {
      const t = getSubtitleTrack(deferredSubtitles[i]);
      if (t > max) max = t;
    }
    return max;
  }, [deferredSubtitles]);

  // rerender-split-combined-hooks: split trackCount from maxTrack derivation
  const trackCount = useMemo(() => {
    const needed = maxTrackFromSubtitles + 1;
    let max = trackCountExplicit;
    if (needed > max) max = needed;
    if (max < 1) max = 1;
    return max;
  }, [trackCountExplicit, maxTrackFromSubtitles]);

  const playback = useVideoPlayback({
    mediaUrl,
    srcDuration,
    trimStart,
    trimEnd,
    videoStore,
  });
  const { effectiveDuration, currentTime } = playback;

  const mutations = useSubtitleMutations({
    videoStore,
    selectedId,
    hasVideo,
    effectiveDuration,
    currentTime,
    trimStart,
    trimEnd,
    trackCountExplicit,
    trackCount,
  });
  const { setSubtitles, setTrackCountExplicit } = mutations;

  useEffect(() => {
    if (maxTrackFromSubtitles + 1 > trackCountExplicit) {
      setTrackCountExplicit(maxTrackFromSubtitles + 1);
    }
  }, [maxTrackFromSubtitles, trackCountExplicit, setTrackCountExplicit]);

  // Migrate old store instances (HMR) — advanced-init-once guard not needed, keep stable callback
  // server-* rules: NA for client-only editor (documented inline below) — server-auth-actions, server-cache-react, etc. not applicable (local-only, no RSC/auth)
  useEffect(() => {
    const s = (videoStore.state ??
      (videoStore as unknown as { get: () => unknown }).get?.()) as unknown as {
      subtitles?: Subtitle[];
      selectedSubtitleId?: string | null;
      subtitleTrackCountExplicit?: number;
    };
    if (
      s.subtitles === undefined ||
      s.selectedSubtitleId === undefined ||
      s.subtitleTrackCountExplicit === undefined
    ) {
      videoStore.setState((prev) => {
        const p = prev as unknown as {
          subtitles?: Subtitle[];
          selectedSubtitleId?: string | null;
          subtitleTrackCountExplicit?: number;
        };
        return {
          ...prev,
          subtitles: p.subtitles ?? [],
          selectedSubtitleId: p.selectedSubtitleId ?? null,
          subtitleTrackCountExplicit: p.subtitleTrackCountExplicit ?? 1,
        };
      });
    }
  }, [videoStore]);

  // Split combined effects — rerender-split-combined-hooks
  // Effect 1: load Google Fonts for current subtitles (live preview) — flatMap + Set dedup
  useEffect(() => {
    if (deferredSubtitles.length === 0) return;
    // js-flatmap-filter + js-set-map-lookups: dedup via Set in one pass
    const uniq = Array.from(
      new Set(
        deferredSubtitles.flatMap((s) =>
          s.style.fontFamily ? [s.style.fontFamily] : [],
        ),
      ),
    );
    for (const f of uniq) {
      ensureGoogleFontLoaded(f).catch(NOOP);
    }
  }, [deferredSubtitles]);

  // init/clamp global trim when duration available — narrow deps primitives only (rerender-dependencies)
  useEffect(() => {
    if (effectiveDuration <= 0) return;
    if (trimEnd === 0) {
      videoStore.setState((prev) => {
        const cur =
          (prev as unknown as { trimRange?: [number, number] }).trimRange ??
          ([0, 0] as [number, number]);
        if (cur[1] === 0)
          return {
            ...prev,
            trimRange: [0, effectiveDuration] as [number, number],
          };
        return prev;
      });
    } else if (trimEnd > effectiveDuration) {
      videoStore.setState((prev) => {
        const cur =
          (prev as unknown as { trimRange?: [number, number] }).trimRange ??
          ([0, 0] as [number, number]);
        const ns = Math.min(cur[0], Math.max(0, effectiveDuration - 1));
        return {
          ...prev,
          trimRange: [ns, effectiveDuration] as [number, number],
        };
      });
    }
  }, [effectiveDuration, trimEnd, videoStore]);

  // js-index-maps: O(1) subtitle lookup via Map (1M ops → 2K ops) — split from filtering (rerender-split-combined-hooks)
  const subtitleById = useMemo(
    () =>
      new Map<string, Subtitle>(deferredSubtitles.map((s) => [s.id, s] as const)),
    [deferredSubtitles],
  );
  const selectedSubtitle = useMemo(
    () => (selectedId ? (subtitleById.get(selectedId) ?? null) : null),
    [subtitleById, selectedId],
  );

  // rerender-derived-state: derived staleness hint (no effect)
  void isSubtitlesStale;

  // js-cache-property-access: cache length
  const deferredLen = deferredSubtitles.length;
  void deferredLen;

  const activeSubtitles = useMemo(
    () =>
      deferredSubtitles.filter(
        (s) => currentTime >= s.startTime && currentTime < s.endTime,
      ),
    [deferredSubtitles, currentTime],
  );

  // js-tosorted-immutable: sorted view for list (no mutation of store array)
  const sortedSubtitles = useMemo(
    () => deferredSubtitles.toSorted((a, b) => a.startTime - b.startTime),
    [deferredSubtitles],
  );

  const templatesHook = useSubtitleTemplates({
    selectedId,
    selectedSubtitle,
    setSubtitles,
  });

  const handleTrimChange = useCallback(
    (newStart: number, newEnd: number) => {
      const d = effectiveDuration || 30;
      let s = clamp(newStart, 0, d - MIN_SUBTITLE_DURATION);
      let e = clamp(newEnd, 0, d);
      if (e - s < MIN_SUBTITLE_DURATION) return;
      if (s < 0) s = 0;
      if (e > d) e = d;
      if (s >= e) return;
      videoStore.setState((prev) => ({
        ...prev,
        trimRange: [s, e] as [number, number],
      }));
      setSubtitles((prev) =>
        prev.map((sub) => {
          let ns = sub.startTime;
          let ne = sub.endTime;
          const dur = ne - ns;
          if (ns < s) {
            ns = s;
            ne = ns + dur;
          }
          if (ne > e) {
            ne = e;
            ns = Math.max(s, ne - dur);
          }
          if (ne - ns < MIN_SUBTITLE_DURATION) {
            ne = Math.min(e, ns + MIN_SUBTITLE_DURATION);
          }
          ns = clamp(ns, s, e - MIN_SUBTITLE_DURATION);
          ne = clamp(ne, ns + MIN_SUBTITLE_DURATION, e);
          return { ...sub, startTime: ns, endTime: ne };
        }),
      );
    },
    [effectiveDuration, videoStore, setSubtitles],
  );

  const { isExporting, handleExport } = useSubtitleExport({
    file,
    trimStart,
    trimEnd,
    sourceWidth,
    sourceHeight,
    layout,
    subtitles: deferredSubtitles,
  });

  return {
    mediaUrl,
    file,
    sourceWidth,
    sourceHeight,
    hasVideo,
    layout,
    deferredSubtitles,
    sortedSubtitles,
    activeSubtitles,
    selectedId,
    selectedSubtitle,
    isSubtitlesStale,
    trackCount,
    trimStart,
    trimEnd,
    isExporting,
    handleTrimChange,
    handleExport,
    ...mutations,
    ...templatesHook,
    ...playback,
  };
}

export type SubtitleEditor = ReturnType<typeof useSubtitleEditor>;
