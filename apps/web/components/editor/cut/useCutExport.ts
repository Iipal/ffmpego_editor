"use client";

import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { useSelector } from "@tanstack/react-store";
import { sortCuts } from "./helpers";
import type { Cut, CutMode } from "./types";
import type { MobileLayout } from "@/lib/mobile-layout";
import { exportQueue } from "@/lib/export-queue";
import { validateSettings } from "@/lib/validate-settings";
import { stripExtension } from "@/lib/video-file";
import { exportQueueStore, selectKindActive } from "@/store/exportQueueSlice";
import { audioStore, getAudioRenderSettings } from "@/store/audioSlice";

export function useCutExport({
  file,
  cuts,
  overlapIds,
  sourceWidth,
  sourceHeight,
  exportName,
  setExportName,
  mode,
  activeWatermark,
  stackedLayout,
  singleLayout,
}: {
  file: File | null;
  cuts: Cut[];
  overlapIds: Set<string>;
  sourceWidth: number;
  sourceHeight: number;
  exportName: string;
  setExportName: (v: string) => void;
  mode: CutMode;
  activeWatermark: boolean;
  stackedLayout: MobileLayout;
  singleLayout: MobileLayout;
}) {
  const audio = useSelector(audioStore);
  const queueItems = useSelector(exportQueueStore).items;
  const activeExports = useMemo(
    () => selectKindActive(queueItems, "cut"),
    [queueItems],
  );

  const onExport = useCallback(() => {
    if (!file) {
      toast.error("No video loaded");
      return;
    }
    if (cuts.length === 0) {
      toast.error("Add at least one cut");
      return;
    }
    if (overlapIds.size > 0) {
      toast.error("Cuts overlap — resize them first");
      return;
    }
    const sw = sourceWidth || 1920;
    const sh = sourceHeight || 1080;
    const base =
      (exportName.trim() || stripExtension(file.name) || "cut") +
      (mode === "full-size"
        ? "_cut"
        : mode === "2-stack"
          ? "_cut_1080x1920"
          : "_cut_1zone_1080x1920");
    const outName = `${base}.mp4`;

    const settingsJson = JSON.stringify({
      mode,
      cuts: sortCuts(cuts).map((c) => ({ start: c.start, end: c.end })),
      sourceWidth: sw,
      sourceHeight: sh,
      exportFilename: base,
      exportFps: 60,
      exportQuality: 10,
      exportSpeed: 1,
      customFFmpegArgs: "",
      watermark: mode === "full-size" ? false : activeWatermark,
      splitRatio: mode === "2-stack" ? stackedLayout.splitRatio : undefined,
      zones:
        mode === "full-size"
          ? undefined
          : mode === "2-stack"
            ? stackedLayout.zones
            : singleLayout.zones,
      audioTracks: audio.tracks.length
        ? getAudioRenderSettings(audio.tracks)
        : undefined,
    });

    // Pre-upload: same schemas the API enforces — fail before upload bytes.
    validateSettings.assertCut(settingsJson);
    exportQueue.enqueue({
      kind: "cut",
      endpoint: "/api/transcode/cut",
      file,
      settingsJson,
      label: outName,
      meta: "Cuts export",
    });
  }, [
    file,
    cuts,
    overlapIds,
    sourceWidth,
    sourceHeight,
    exportName,
    mode,
    activeWatermark,
    stackedLayout,
    singleLayout,
    audio,
  ]);

  return { activeExports, exportName, setExportName, onExport };
}

export function useExportName() {
  const [exportName, setExportName] = useState("");
  return { exportName, setExportName };
}
