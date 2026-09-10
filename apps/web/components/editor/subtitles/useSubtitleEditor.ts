"use client";

import { useCallback, useDeferredValue, useEffect, useMemo } from "react";
import { useSelector } from "@tanstack/react-store";
import { sourceStore } from "@/store/sourceSlice";
import { subtitleStore, setSubtitleState } from "@/store/subtitleSlice";
import { mobileLayoutService } from "@/lib/mobile-layout";
import { useSharedMobileLayout } from "@/hooks/useSharedMobileLayout";
import type { Subtitle } from "@/lib/subtitles/subtitleStorage";
import { SubtitleStorage } from "@/lib/subtitles/subtitleStorage";
import { googleFonts } from "@/lib/subtitles/googleFonts";
import { NOOP } from "./heavy-modules";
import { initAppOnce } from "@/lib/heavy";
import { getSubtitleTrack } from "./subtitle-helpers";
import { useSubtitleExport } from "./useSubtitleExport";
import { useSubtitleMutations } from "./useSubtitleMutations";
import { useSubtitleTemplates } from "./useSubtitleTemplates";
import { useVideoPlayback } from "./useVideoPlayback";

// Composer hook: store subscriptions, derived state, mutations, templates, trim, playback, export.
export function useSubtitleEditor() {
  // advanced-init-once: ensure one-time preconnect, not per mount
  useEffect(() => {
    initAppOnce("subtitles", [
      "https://fonts.googleapis.com",
      "https://fonts.gstatic.com",
    ]);
  }, []);

  // rerender-derived-state + rerender-dependencies: subscribe narrowly to
  // primitives only (whole-store spread would re-render on any field change,
  // e.g. uploadProgress/volume). Each selector re-renders only on its slice.
  const mediaUrl = useSelector(sourceStore, (s) => s.mediaUrl);
  const srcDuration = useSelector(sourceStore, (s) => s.duration);
  const file = useSelector(sourceStore, (s) => s.file);
  const sourceWidth = useSelector(sourceStore, (s) => s.sourceWidth);
  const sourceHeight = useSelector(sourceStore, (s) => s.sourceHeight);
  const trimRangeStore =
    useSelector(sourceStore, (s) => s.trimRange) ??
    ([0, 0] as [number, number]);
  const rawSubtitles = useSelector(subtitleStore, (s) => s.subtitles);
  const rawSelectedId = useSelector(subtitleStore, (s) => s.selectedSubtitleId);
  const rawTrackCount = useSelector(
    subtitleStore,
    (s) => s.subtitleTrackCountExplicit,
  );

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
  });
  const { effectiveDuration, currentTime } = playback;

  const mutations = useSubtitleMutations({
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
    if (subtitleStore.state.subtitles === undefined) {
      setSubtitleState((prev) => ({
        ...prev,
        subtitles: [],
        selectedSubtitleId: null,
        subtitleTrackCountExplicit: 1,
      }));
    }
  }, []);

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
    // async-parallel: single Promise.all for independent font loads (no sequential awaits)
    void Promise.all(
      uniq.map((f) => googleFonts.ensureGoogleFontLoaded(f)),
    ).catch(NOOP);
  }, [deferredSubtitles]);

  // js-index-maps: O(1) subtitle lookup via Map (1M ops → 2K ops) — split from filtering (rerender-split-combined-hooks)
  const subtitleById = useMemo(
    () =>
      new Map<string, Subtitle>(
        deferredSubtitles.map((s) => [s.id, s] as const),
      ),
    [deferredSubtitles],
  );
  const selectedSubtitle = useMemo(
    () => (selectedId ? (subtitleById.get(selectedId) ?? null) : null),
    [subtitleById, selectedId],
  );

  // rerender-derived-state: staleness hint consumed by SubtitleListPanel dimming

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

  // Shared trim-range state is owned by the self-owned TrimControls card
  // (useTrimRange inside it). The retime side-effect is passed to the card
  // as onTrimChange in pageEditorSubtitles and runs on every committed
  // range change.
  const retimeSubtitlesToTrim = useCallback(
    (s: number, e: number) => {
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
          if (ne - ns < SubtitleStorage.MIN_DURATION) {
            ne = Math.min(e, ns + SubtitleStorage.MIN_DURATION);
          }
          ns = mobileLayoutService.clamp(
            ns,
            s,
            e - SubtitleStorage.MIN_DURATION,
          );
          ne = mobileLayoutService.clamp(
            ne,
            ns + SubtitleStorage.MIN_DURATION,
            e,
          );
          return { ...sub, startTime: ns, endTime: ne };
        }),
      );
    },
    [setSubtitles],
  );

  const {
    isPreparing,
    handleExport,
    activeExports,
    customFFmpegArgs,
    setCustomFFmpegArgs,
  } = useSubtitleExport({
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
    isPreparing,
    activeExports,
    customFFmpegArgs,
    setCustomFFmpegArgs,
    retimeSubtitlesToTrim,
    handleExport,
    ...mutations,
    ...templatesHook,
    ...playback,
  };
}

export type SubtitleEditor = ReturnType<typeof useSubtitleEditor>;
