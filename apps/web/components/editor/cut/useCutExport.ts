"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { useVideoStore } from "@/store/useVideoStore";
import { sortCuts } from "./helpers";
import type { Cut, CutMode } from "./types";
import type { MobileLayout } from "@/lib/mobile-layout";
import { fetchDownloadBlob, saveBlobFile } from "@/lib/save-blob-file";
import { awaitTranscodeCompletion } from "@/lib/transcode-progress";
import { stripExtension } from "@/lib/video-file";

type VideoStore = ReturnType<typeof useVideoStore>;

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
  videoStore,
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
  videoStore: VideoStore;
}) {
  const [isExporting, setIsExporting] = useState(false);

  const onExport = useCallback(async () => {
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
    });

    setIsExporting(true);
    toast.loading(`Exporting ${cuts.length} cut(s)…`, { id: "cut-export" });
    try {
      const [{ API_BASE_URL }, chunkedMod] = await Promise.all([
        import("@/lib/api-client"),
        import("@/lib/upload-chunked"),
      ]);
      const { shouldUseChunked, uploadFileChunked, uploadFormWithProgress } =
        chunkedMod;
      const vs = videoStore;
      const setUpload = (sent: number, total: number) =>
        vs.setState((p) => ({
          ...p,
          uploadStage: "transcode",
          uploadStatus: "uploading",
          uploadProgress: total ? Math.round((sent / total) * 100) : 0,
          uploadBytesSent: sent,
          uploadBytesTotal: total,
        }));
      vs.setState((p) => ({
        ...p,
        uploadStage: "transcode",
        uploadStatus: "uploading",
        uploadProgress: 0,
        uploadBytesSent: 0,
        uploadBytesTotal: file.size,
      }));

      let res: Response;
      if (shouldUseChunked(file)) {
        const { uploadId } = await uploadFileChunked(file, {
          onProgress: setUpload,
        });
        setUpload(file.size, file.size);
        const fd2 = new FormData();
        fd2.append("settings", settingsJson);
        res = await fetch(`${API_BASE_URL}/api/transcode/cut`, {
          method: "POST",
          headers: { "x-upload-id": uploadId },
          body: fd2,
        });
      } else {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("settings", settingsJson);
        const json = await uploadFormWithProgress<{
          jobId: string;
          progressUrl: string;
        }>("/api/transcode/cut", fd, { onUploadProgress: setUpload });
        res = new Response(JSON.stringify(json), { status: 200 });
      }
      vs.setState((p) => ({ ...p, uploadProgress: 100, uploadStatus: "done" }));
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(payload?.error ?? `Export failed: ${res.status}`);
      }
      const j = (await res.json()) as { jobId: string; progressUrl: string };
      const progressUrl = new URL(j.progressUrl, API_BASE_URL).toString();
      await awaitTranscodeCompletion(progressUrl, (progress) => {
        toast.loading(`Exporting cuts… ${Math.round(progress)}%`, {
          id: "cut-export",
        });
      });
      toast.loading("Downloading file…", { id: "cut-export" });
      const blob = await fetchDownloadBlob(
        `${API_BASE_URL}/api/transcode/download/${j.jobId}`,
      );
      try {
        const savedName = await saveBlobFile(blob, outName);
        toast.success("Cuts video saved", {
          id: "cut-export",
          description: savedName,
        });
      } catch (e) {
        if ((e as DOMException)?.name === "AbortError") {
          toast.dismiss("cut-export");
          return;
        }
        throw e;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Export failed";
      toast.error(msg, { id: "cut-export" });
      videoStore.setState((p) => ({ ...p, uploadStatus: "error" }));
    } finally {
      setIsExporting(false);
    }
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
    videoStore,
  ]);

  return { isExporting, exportName, setExportName, onExport };
}

export function useExportName() {
  const [exportName, setExportName] = useState("");
  return { exportName, setExportName };
}
