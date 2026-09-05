"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import type { MobileLayout } from "@/lib/mobile-layout";
import type { Subtitle } from "@/lib/subtitles/subtitleTypes";
import { HEAVY_MODULES } from "./heavy-modules";
import { fetchDownloadBlob, saveBlobFile } from "@/lib/save-blob-file";
import { awaitTranscodeCompletion } from "@/lib/transcode-progress";
import { stripExtension } from "@/lib/video-file";

export type UseSubtitleExportArgs = {
  file: File | null;
  trimStart: number;
  trimEnd: number;
  sourceWidth: number;
  sourceHeight: number;
  layout: MobileLayout;
  subtitles: Subtitle[];
};

// Export flow: render subtitle PNGs + transcode 9:16 mobile mp4 via API.
export function useSubtitleExport({
  file,
  trimStart,
  trimEnd,
  sourceWidth,
  sourceHeight,
  layout,
  subtitles,
}: UseSubtitleExportArgs) {
  const [isExporting, setIsExporting] = useState(false);

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
    // js-hoist-regexp already hoisted, no inline RegExp
    const sw = sourceWidth || 1920;
    const sh = sourceHeight || 1080;
    const baseName =
      (stripExtension(file.name) || "video") +
      "_mobile_subtitles_1080x1920";
    const outName = baseName + ".mp4";
    setIsExporting(true);
    toast.loading(
      subtitles.length
        ? `Rendering ${subtitles.length} subtitle PNGs…`
        : "Exporting mobile mp4 (CRF 10)…",
      {
        id: "subtitles-export",
      },
    );
    try {
      // async-parallel: independent async work (API client + PNG render) in parallel — single round trip
      // async-defer-await: start promises early, await late
      const apiClientPromise = HEAVY_MODULES.apiClient();
      const pngPromise =
        subtitles.length === 0
          ? Promise.resolve(
              [] as Array<{
                meta: {
                  startTime: number;
                  endTime: number;
                  x: number;
                  y: number;
                  width: number;
                  height: number;
                };
                blob: Blob;
              }>,
            )
          : HEAVY_MODULES.subtitlePng().then((m) =>
              m.renderAllSubtitlesToPngs(subtitles),
            );

      const [{ API_BASE_URL }, rendered] = await Promise.all([
        apiClientPromise,
        pngPromise,
      ]);

      toast.loading(`Exporting ${rendered.length} subtitles + 9:16…`, {
        id: "subtitles-export",
      });
      const fd = new FormData();
      fd.append("file", file);
      fd.append(
        "settings",
        JSON.stringify({
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
        }),
      );
      // js-cache-property-access: cache rendered.length
      const renderedLen = rendered.length;
      const subtitlesMeta: Array<{
        startTime: number;
        endTime: number;
        x: number;
        y: number;
        width: number;
        height: number;
      }> = [];
      for (let i = 0; i < renderedLen; i++) {
        const r = rendered[i];
        subtitlesMeta.push({
          startTime: r.meta.startTime,
          endTime: r.meta.endTime,
          x: r.meta.x,
          y: r.meta.y,
          width: r.meta.width,
          height: r.meta.height,
        });
      }
      fd.append("subtitles", JSON.stringify(subtitlesMeta));
      for (let i = 0; i < renderedLen; i++) {
        const r = rendered[i];
        const f = new File([r.blob], `subtitle_${i}.png`, {
          type: "image/png",
        });
        fd.append(`subtitle_${i}`, f);
      }
      // async-dependencies: fetch depends on API_BASE_URL already resolved above, no waterfall with PNG render
      const res = await fetch(
        `${API_BASE_URL}/api/transcode/mobile/subtitles`,
        {
          method: "POST",
          body: fd,
        },
      );
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(payload?.error ?? `Export failed: ${res.status}`);
      }
      const j = (await res.json()) as { jobId: string; progressUrl: string };
      const progressUrl = new URL(j.progressUrl, API_BASE_URL).toString();
      await awaitTranscodeCompletion(progressUrl, (progress) => {
        toast.loading(`Exporting… ${Math.round(progress)}%`, {
          id: "subtitles-export",
        });
      });
      toast.loading("Downloading file…", { id: "subtitles-export" });
      const downloadUrl = `${API_BASE_URL}/api/transcode/download/${j.jobId}`;
      const blob = await fetchDownloadBlob(downloadUrl);
      try {
        const savedName = await saveBlobFile(blob, outName);
        toast.success("Video saved", {
          id: "subtitles-export",
          description: savedName,
        });
      } catch (e) {
        if ((e as DOMException)?.name === "AbortError") {
          toast.dismiss("subtitles-export");
          return;
        }
        throw e;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Export failed";
      if ((e as DOMException)?.name === "AbortError")
        toast.dismiss("subtitles-export");
      else toast.error(msg, { id: "subtitles-export" });
    } finally {
      setIsExporting(false);
    }
  }, [
    file,
    trimStart,
    trimEnd,
    sourceWidth,
    sourceHeight,
    layout,
    subtitles,
  ]);

  return { isExporting, handleExport };
}
