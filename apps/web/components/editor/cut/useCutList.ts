"use client";

import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { clamp } from "@/lib/mobile-layout";
import { cutsOverlap, newId, sortCuts, totalDuration } from "./helpers";
import type { Cut } from "./types";

export function useCutList({ duration }: { duration: number }) {
  const [cuts, setCuts] = useState<Cut[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const sorted = useMemo(() => sortCuts(cuts), [cuts]);
  const overlapIds = useMemo(
    () => new Set(cutsOverlap(cuts).map((c) => c.id)),
    [cuts],
  );
  const outDuration = useMemo(() => totalDuration(cuts), [cuts]);
  const selected = cuts.find((c) => c.id === selectedId) ?? null;

  const patchCut = useCallback((id: string, next: Cut) => {
    setCuts((prev) => prev.map((c) => (c.id === id ? next : c)));
  }, []);

  // NOTE: currentTime + seekTo are call-time args (instead of hook deps as in
  // the monolith) so this hook and useCutPlayback don't depend on each other.
  const addCut = useCallback(
    (currentTime: number, seekTo: (t: number) => void) => {
      if (!duration) {
        toast.error("Video duration unknown yet");
        return;
      }
      const t = clamp(currentTime, 0, Math.max(0, duration - 0.3));
      const end = clamp(t + 2, t + 0.2, duration);
      if (end - t < 0.2) {
        toast.error("Not enough room at playhead");
        return;
      }
      const cut: Cut = {
        id: newId(),
        start: Math.round(t * 100) / 100,
        end: Math.round(end * 100) / 100,
      };
      setCuts((prev) => [...prev, cut]);
      setSelectedId(cut.id);
      seekTo(cut.start);
    },
    [duration],
  );

  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    setCuts((prev) => prev.filter((c) => c.id !== selectedId));
    setSelectedId(null);
  }, [selectedId]);

  const clearCuts = useCallback(() => {
    setCuts([]);
    setSelectedId(null);
  }, []);

  return {
    cuts,
    setCuts,
    selectedId,
    setSelectedId,
    sorted,
    overlapIds,
    outDuration,
    selected,
    patchCut,
    addCut,
    deleteSelected,
    clearCuts,
  };
}
