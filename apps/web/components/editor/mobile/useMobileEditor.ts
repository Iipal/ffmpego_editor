"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createDefaultLayout,
  normalizeLayout,
} from "@/lib/mobile-layout";
import type { MobileLayout } from "@/lib/mobile-layout";
import { DEFAULT_SPLIT, getCachedLayout } from "./mobile-helpers";
import type { EditorHistory, ZoneId } from "./types";

export function useMobileEditor() {
  const [history, setHistory] = useState<EditorHistory>(() => ({
    layout: getCachedLayout() ?? createDefaultLayout("stacked", DEFAULT_SPLIT),
    past: [],
    future: [],
  }));
  const [selected, setSelected] = useState<ZoneId>("zone-1");
  const [safe, setSafe] = useState(true);
  const [useWatermark, setUseWatermark] = useState(true);
  const [ignoreTrim, setIgnoreTrim] = useState(false);
  const currentTimeRef = useRef(0);
  const durationRef = useRef(0);
  const [durationTick, setDurationTick] = useState(0);

  const layout = history.layout;

  const effectiveSelected: ZoneId =
    layout.mode === "full" && selected === "zone-2" ? "zone-1" : selected;

  const layoutRef = useRef(layout);
  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  const commit = useCallback((updater: (l: MobileLayout) => MobileLayout) => {
    setHistory((prev) => {
      const nextLayout = normalizeLayout(updater(prev.layout));
      if (nextLayout === prev.layout) return prev;
      return {
        layout: nextLayout,
        past: [...prev.past.slice(-49), prev.layout],
        future: [],
      };
    });
  }, []);

  const setLayout = useCallback(
    (next: MobileLayout) => {
      commit(() => next);
    },
    [commit],
  );

  const undoOp = useCallback(() => {
    setHistory((prev) => {
      if (prev.past.length === 0) return prev;
      const previous = prev.past[prev.past.length - 1];
      return {
        layout: previous,
        past: prev.past.slice(0, -1),
        future: [...prev.future, prev.layout],
      };
    });
  }, []);

  const redoOp = useCallback(() => {
    setHistory((prev) => {
      if (prev.future.length === 0) return prev;
      const next = prev.future[prev.future.length - 1];
      return {
        layout: next,
        past: [...prev.past, prev.layout],
        future: prev.future.slice(0, -1),
      };
    });
  }, []);

  const setDuration = useCallback((d: number) => {
    durationRef.current = d;
    setDurationTick((t) => t + 1);
  }, []);

  const getDuration = useCallback(() => durationRef.current, []);
  void durationTick;

  return {
    layout,
    setLayout,
    commit,
    selected: effectiveSelected,
    setSelected,
    safe,
    setSafe,
    useWatermark,
    setUseWatermark,
    ignoreTrim,
    setIgnoreTrim,
    undo: history.past,
    redo: history.future,
    undoOp,
    redoOp,
    currentTimeRef,
    durationRef,
    setDuration,
    getDuration,
    duration: durationRef.current,
  };
}

export type MobileEditorApi = ReturnType<typeof useMobileEditor>;
