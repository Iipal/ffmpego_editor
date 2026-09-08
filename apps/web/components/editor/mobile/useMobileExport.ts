"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { setSourceState } from "@/store/sourceSlice";
import type { MobileLayout } from "@/lib/mobile-layout";
import { FILENAME_SANITIZE_RE, downloadAndSaveMobile } from "./mobile-helpers";
import { NOOP } from "@/lib/utils";
import { awaitTranscodeCompletion } from "@/lib/transcode-progress";
import { queuedLabel, throwTranscodeHttpError } from "@/lib/transcode-jobs";
import { stripExtension } from "@/lib/video-file";
import { useSelector } from "@tanstack/react-store";
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
  const [isExporting, setIsExporting] = useState(false);
  const audio = useSelector(audioStore);

  const onExport = useCallback(async () => {
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
    const sanitizedBase = file.name.replace(FILENAME_SANITIZE_RE, "_");
    void sanitizedBase;
    const sw = sourceWidth || 1920;
    const sh = sourceHeight || 1080;
    const outName = stripExtension(file.name) + "_mobile_1080x1920.mp4";
    const baseName = outName.replace(/\.mp4$/, "");
    toast.info("FFmpeg filter ready", {
      description: filterString.slice(0, 120) + "…",
    });
    const [{ API_BASE_URL }, chunkedMod] = await Promise.all([
      import("@/lib/api-client"),
      import("@/lib/upload-chunked"),
    ]);
    const { shouldUseChunked, uploadFileChunked, uploadFormWithProgress } =
      chunkedMod;
    setIsExporting(true);
    toast.loading("Exporting mobile mp4 (CRF 10)...", { id: "mobile-export" });
    try {
      const setUpload = (sent: number, total: number) =>
        setSourceState((p) => ({
          ...p,
          uploadStage: "transcode",
          uploadStatus: "uploading",
          uploadProgress: total ? Math.round((sent / total) * 100) : 0,
          uploadBytesSent: sent,
          uploadBytesTotal: total,
        }));
      setSourceState((p) => ({
        ...p,
        uploadStage: "transcode",
        uploadStatus: "uploading",
        uploadProgress: 0,
        uploadBytesSent: 0,
        uploadBytesTotal: file.size,
      }));
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
      let res: Response;
      if (shouldUseChunked(file)) {
        const { uploadId } = await uploadFileChunked(file, {
          onProgress: setUpload,
        });
        setUpload(file.size, file.size);
        const fd2 = new FormData();
        fd2.append("settings", settingsJson);
        res = await fetch(`${API_BASE_URL}/api/transcode/mobile`, {
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
        }>("/api/transcode/mobile", fd, { onUploadProgress: setUpload });
        res = new Response(JSON.stringify(json), { status: 200 });
      }
      setSourceState((p) => ({
        ...p,
        uploadProgress: 100,
        uploadStatus: "done",
      }));
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        // B2: shapes 429 (queue full + Retry-After) distinctly.
        throwTranscodeHttpError(res, payload);
      }
      const j = (await res.json()) as { jobId: string; progressUrl: string };
      const progressUrl = new URL(j.progressUrl, API_BASE_URL).toString();
      await awaitTranscodeCompletion(progressUrl, (progress, info) => {
        toast.loading(
          info?.status === "queued"
            ? `${queuedLabel(info.queuePosition)} — waiting for a worker…`
            : `Exporting mobile mp4… ${Math.round(progress)}%`,
          { id: "mobile-export" },
        );
      });
      toast.loading("Downloading file…", { id: "mobile-export" });
      const savedName = await downloadAndSaveMobile(j.jobId, outName);
      toast.success("Mobile video saved", {
        id: "mobile-export",
        description: savedName,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Export failed";
      if ((e as DOMException)?.name === "AbortError") {
        toast.dismiss("mobile-export");
        setSourceState((p) => ({
          ...p,
          uploadStatus: "idle",
          uploadStage: null,
        }));
      } else {
        toast.error(msg, { id: "mobile-export" });
        setSourceState((p) => ({ ...p, uploadStatus: "error" }));
        navigator.clipboard?.writeText(filterString).catch(NOOP);
      }
    } finally {
      setIsExporting(false);
    }
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

  return { onExport, isExporting };
}
