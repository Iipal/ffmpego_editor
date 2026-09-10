"use client";

import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { useSelector } from "@tanstack/react-store";
import { PLAN_VERSION } from "@repo/contracts";
import type { MobileLayout } from "@/lib/mobile-layout";
import type { Subtitle } from "@/lib/subtitles/subtitleStorage";
import { HEAVY_MODULES } from "./heavy-modules";
import { exportQueue } from "@/lib/export-queue";
import { validateSettings } from "@/lib/validate-settings";
import { videoFileService } from "@/lib/video-file";
import { exportQueueStore, selectKindActive } from "@/store/exportQueueSlice";
import { audioStore, getAudioRenderSettings } from "@/store/audioSlice";

export type UseSubtitleExportArgs = {
  file: File | null;
  trimStart: number;
  trimEnd: number;
  sourceWidth: number;
  sourceHeight: number;
  layout: MobileLayout;
  subtitles: Subtitle[];
};

// Export flow: render subtitle PNGs, then queue a fire-and-forget transcode job.
export function useSubtitleExport({
  file,
  trimStart,
  trimEnd,
  sourceWidth,
  sourceHeight,
  layout,
  subtitles,
}: UseSubtitleExportArgs) {
  const [isPreparing, setIsPreparing] = useState(false);
  const queueItems = useSelector(exportQueueStore).items;
  // AudioControls on this page fills the same global track list the
  // crop/mobile/cut exports forward — its Include switches are the picker.
  const audioTracks = useSelector(audioStore, (s) => s.tracks);
  const activeExports = useMemo(
    () => selectKindActive(queueItems, "subtitles"),
    [queueItems],
  );

  const handleExport = useCallback(async () => {
    // async-cheap-condition-before-await: cheap sync guards first
    if (!file) {
      toast.error("No video loaded");
      return;
    }
    if (trimEnd <= trimStart + 0.05) {
      toast.error("Invalid trim range");
      return;
    }
    const sw = sourceWidth || 1920;
    const sh = sourceHeight || 1080;
    const baseName =
      (videoFileService.stripExtension(file.name) || "video") +
      "_mobile_subtitles_1080x1920";
    const outName = baseName + ".mp4";
    const settings = {
      mobileLayout: layout,
      sourceWidth: sw,
      sourceHeight: sh,
      trimRange: [trimStart, trimEnd],
      exportFormat: "mp4",
      exportFps: 30,
      exportFilename: baseName,
      exportQuality: 10,
      exportSpeed: 1,
      customFFmpegArgs: "",
      audioTracks: audioTracks.length
        ? getAudioRenderSettings(audioTracks)
        : undefined,
    };
    // Pre-upload: same schemas the API enforces — fail before PNG render.
    validateSettings.assertMobile(JSON.stringify(settings));
    // v1 envelope: bare v0 settings kind-detect as "mobile", which the
    // /mobile/subtitles endpoint rejects (kind mismatch) — the wrapper pins
    // the "mobile-subtitles" plan kind the route requires.
    const settingsJson = JSON.stringify({
      version: PLAN_VERSION,
      kind: "mobile-subtitles",
      settings,
    });
    setIsPreparing(true);
    toast.loading(
      subtitles.length
        ? `Rendering ${subtitles.length} subtitle PNGs…`
        : "Preparing export…",
      { id: "subtitles-export" },
    );
    try {
      const rendered =
        subtitles.length === 0
          ? []
          : await HEAVY_MODULES.subtitlePng().then((m) =>
              m.renderAllSubtitlesToPngs(subtitles),
            );
      toast.dismiss("subtitles-export");
      exportQueue.enqueue({
        kind: "subtitles",
        endpoint: "/api/transcode/mobile/subtitles",
        file,
        settingsJson,
        // This endpoint takes per-subtitle PNGs; keep the direct multipart
        // path (no chunked re-upload) like the previous inline flow.
        forceDirect: true,
        label: outName,
        meta: "Subtitles export",
        formExtras: (fd) => {
          fd.append("subtitles", JSON.stringify(rendered.map((r) => r.meta)));
          rendered.forEach((r, i) => {
            fd.append(
              `subtitle_${i}`,
              new File([r.blob], `subtitle_${i}.png`, { type: "image/png" }),
            );
          });
        },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Export failed";
      toast.error(msg, { id: "subtitles-export" });
    } finally {
      setIsPreparing(false);
    }
  }, [
    file,
    trimStart,
    trimEnd,
    sourceWidth,
    sourceHeight,
    layout,
    subtitles,
    audioTracks,
  ]);

  return { isPreparing, handleExport, activeExports };
}
