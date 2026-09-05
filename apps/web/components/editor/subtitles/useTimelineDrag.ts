"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { clamp } from "@/lib/mobile-layout";
import { MIN_SUBTITLE_DURATION } from "@/lib/subtitles/subtitleDefaults";
import {
  ensureGlobalPointerListeners,
  globalPointerMoveHandlers,
  globalPointerUpHandlers,
} from "./pointer-bus";

export type TimelineDragMode = "move" | "left" | "right";

export type TimelineDragState = {
  id: string;
  mode: TimelineDragMode;
  startX: number;
  startY: number;
  origStart: number;
  origEnd: number;
  origTrack: number;
} | null;

export type UseTimelineDragArgs = {
  trackRef: RefObject<HTMLDivElement | null>;
  duration: number;
  trimStart: number;
  trimEnd: number;
  trackCount: number;
  rowHeight: number;
  onUpdateSubtitle: (id: string, start: number, end: number) => void;
  onUpdateTrack: (id: string, newTrack: number) => void;
};

// Drag interaction for TimelineVisual: horizontal retime + vertical track move.
// Extracted so TimelineVisual stays a pure render component.
export function useTimelineDrag({
  trackRef,
  duration,
  trimStart,
  trimEnd,
  trackCount,
  rowHeight,
  onUpdateSubtitle,
  onUpdateTrack,
}: UseTimelineDragArgs) {
  const [drag, setDrag] = useState<TimelineDragState>(null);

  // advanced-event-handler-refs: store latest callbacks in refs to keep toTime stable
  const onUpdateSubtitleRef = useRef(onUpdateSubtitle);
  const onUpdateTrackRef = useRef(onUpdateTrack);
  const trackCountRef = useRef(trackCount);
  useEffect(() => {
    onUpdateSubtitleRef.current = onUpdateSubtitle;
    onUpdateTrackRef.current = onUpdateTrack;
    trackCountRef.current = trackCount;
  }, [onUpdateSubtitle, onUpdateTrack, trackCount]);

  const toTime = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el || duration <= 0) return 0;
      // js-cache-property-access: cache rect
      const rect = el.getBoundingClientRect();
      const pct = clamp((clientX - rect.left) / rect.width, 0, 1);
      return pct * duration;
    },
    [duration, trackRef],
  );

  // client-event-listeners: dedup global pointer listeners (single listener for all drags)
  useEffect(() => {
    if (!drag) return;
    ensureGlobalPointerListeners();
    const dragSnapshot = drag;
    const onMove = (e: PointerEvent) => {
      const deltaTime = toTime(e.clientX) - toTime(dragSnapshot.startX);
      if (dragSnapshot.mode === "move") {
        const dur = dragSnapshot.origEnd - dragSnapshot.origStart;
        let ns = dragSnapshot.origStart + deltaTime;
        let ne = dragSnapshot.origEnd + deltaTime;
        if (ns < trimStart) {
          ns = trimStart;
          ne = ns + dur;
        }
        if (ne > trimEnd) {
          ne = trimEnd;
          ns = ne - dur;
        }
        ns = clamp(ns, trimStart, trimEnd - MIN_SUBTITLE_DURATION);
        ne = clamp(ne, ns + MIN_SUBTITLE_DURATION, trimEnd);
        onUpdateSubtitleRef.current(dragSnapshot.id, ns, ne);
        const deltaY = e.clientY - dragSnapshot.startY;
        const trackDelta = Math.round(deltaY / rowHeight);
        let newTrack = clamp(dragSnapshot.origTrack + trackDelta, 0, 99);
        if (newTrack > trackCountRef.current) newTrack = trackCountRef.current;
        if (newTrack !== dragSnapshot.origTrack) {
          onUpdateTrackRef.current(dragSnapshot.id, newTrack);
        }
      } else if (dragSnapshot.mode === "left") {
        const ns = clamp(
          dragSnapshot.origStart + deltaTime,
          trimStart,
          dragSnapshot.origEnd - MIN_SUBTITLE_DURATION,
        );
        onUpdateSubtitleRef.current(dragSnapshot.id, ns, dragSnapshot.origEnd);
      } else if (dragSnapshot.mode === "right") {
        const ne = clamp(
          dragSnapshot.origEnd + deltaTime,
          dragSnapshot.origStart + MIN_SUBTITLE_DURATION,
          trimEnd,
        );
        onUpdateSubtitleRef.current(
          dragSnapshot.id,
          dragSnapshot.origStart,
          ne,
        );
      }
    };
    const onUp = () => setDrag(null);
    globalPointerMoveHandlers.add(onMove);
    globalPointerUpHandlers.add(onUp);
    return () => {
      globalPointerMoveHandlers.delete(onMove);
      globalPointerUpHandlers.delete(onUp);
    };
  }, [drag, toTime, trimStart, trimEnd, rowHeight]);

  return { drag, setDrag, toTime };
}
