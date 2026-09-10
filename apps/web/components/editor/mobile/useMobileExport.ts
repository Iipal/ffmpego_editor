"use client";

import { useCallback, useMemo } from "react";
import { toast } from "sonner";
import { useSelector } from "@tanstack/react-store";
import type { MobileLayout } from "@/lib/mobile-layout";
import { exportQueue } from "@/lib/export-queue";
import { assertMobileSettings } from "@/lib/validate-settings";
import { stripExtension } from "@/lib/video-file";
import { NOOP } from "@/lib/utils";
import { exportQueueStore, selectKindActive } from "@/store/exportQueueSlice";
import { audioStore, getAudioRenderSettings } from "@/store/audioSlice";

type ExportArgs = {
  file: File | null;
  validationError: string | null;
  trimRange: [number, number];
  sourceWidth: number;
  sourceHeight: number;
  filterString: string;
  layout: MobileLayout;
  useWatermark: boolean;
  ignoreTrim: boolean;
};

export function useMobileExport(args: ExportArgs) {
  const {
    file,
    validationError,
    trimRange,
    sourceWidth,
    sourceHeight,
    filterString,
    layout,
    useWatermark,
    ignoreTrim,
  } = args;
  const audio = useSelector(audioStore);
  const queueItems = useSelector(exportQueueStore).items;
  const activeExports = useMemo(
    () => selectKindActive(queueItems, "mobile"),
    [queueItems],
  );

  const onExport = useCallback(() => {
    if (!file) {
      toast.error("No video loaded");
      return;
    }
    if (validationError) {
      toast.error(validationError);
      return;
    }
    if (!ignoreTrim && trimRange[1] <= trimRange[0] + 0.05) {
      toast.error("Invalid trim range");
      return;
    }
    const sw = sourceWidth || 1920;
    const sh = sourceHeight || 1080;
    const outName = stripExtension(file.name) + "_mobile_1080x1920.mp4";
    const baseName = outName.replace(/\.mp4$/, "");
    toast.info("FFmpeg filter ready", {
      description: filterString.slice(0, 120) + "…",
    });
    const settingsJson = JSON.stringify({
      mobileLayout: layout,
      sourceWidth: sw,
      sourceHeight: sh,
      trimRange,
      ignoreTrim,
      exportFormat: "mp4",
      exportFps: 30,
      exportFilename: baseName,
      exportQuality: 10,
      exportSpeed: 1,
      customFFmpegArgs: "",
      watermark: useWatermark,
      audioTracks: audio.tracks.length
        ? getAudioRenderSettings(audio.tracks)
        : undefined,
    });
    // Pre-upload: same schemas the API enforces — fail before upload bytes.
    assertMobileSettings(settingsJson);
    exportQueue.enqueue({
      kind: "mobile",
      endpoint: "/api/transcode/mobile",
      file,
      settingsJson,
      label: outName,
      meta: "Mobile video saved",
      onError: (message) => {
        if (message) navigator.clipboard?.writeText(filterString).catch(NOOP);
      },
    });
  }, [
    file,
    validationError,
    trimRange,
    sourceWidth,
    sourceHeight,
    filterString,
    layout,
    useWatermark,
    ignoreTrim,
    audio,
  ]);

  return { onExport, activeExports };
}
