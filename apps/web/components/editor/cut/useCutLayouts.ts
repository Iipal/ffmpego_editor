"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import {
  createDefaultLayout,
  loadPrefForMode,
} from "@/lib/mobile-layout";
import type { CropZone, MobileLayout } from "@/lib/mobile-layout";
import type { CutMode } from "./types";

export function useCutLayouts() {
  const [mode, setMode] = useState<CutMode>("full-size");
  const [stackedLayout, setStackedLayout] = useState<MobileLayout>(
    () => loadPrefForMode("stacked") ?? createDefaultLayout("stacked", 0.5),
  );
  const [singleLayout, setSingleLayout] = useState<MobileLayout>(
    () => loadPrefForMode("full") ?? createDefaultLayout("full", 0.5),
  );
  const [watermarkStack, setWatermarkStack] = useState(true);
  const [watermarkSingle, setWatermarkSingle] = useState(true);

  const activeLayout: MobileLayout | null =
    mode === "2-stack"
      ? stackedLayout
      : mode === "1-stack"
        ? singleLayout
        : null;
  const activeWatermark = mode === "2-stack" ? watermarkStack : watermarkSingle;

  const syncFromMobile = useCallback(() => {
    const s = loadPrefForMode("stacked");
    const f = loadPrefForMode("full");
    if (s) setStackedLayout(s);
    if (f) setSingleLayout(f);
    toast.success("Zones synced from Mobile editor");
  }, []);

  const updateZone = useCallback(
    (layout: "stacked" | "full", id: string, z: CropZone) => {
      if (layout === "stacked") {
        setStackedLayout((prev) => ({
          ...prev,
          zones: prev.zones.map((zz) => (zz.id === id ? z : zz)),
        }));
      } else {
        setSingleLayout((prev) => ({
          ...prev,
          zones: prev.zones.map((zz) => (zz.id === id ? z : zz)),
        }));
      }
    },
    [],
  );

  return {
    mode,
    setMode,
    stackedLayout,
    setStackedLayout,
    singleLayout,
    watermarkStack,
    setWatermarkStack,
    watermarkSingle,
    setWatermarkSingle,
    activeLayout,
    activeWatermark,
    syncFromMobile,
    updateZone,
  };
}
