"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { useVideoStore } from "@/store/useVideoStore";
import type { MobileLayout } from "@/lib/mobile-layout";
import { FILENAME_SANITIZE_RE, downloadAndSaveMobile } from "./mobile-helpers";
import { NOOP } from "@/lib/utils";
import { awaitTranscodeCompletion } from "@/lib/transcode-progress";
import { stripExtension } from "@/lib/video-file";

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
  const videoStore = useVideoStore();
  const [isExporting, setIsExporting] = useState(false);

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
    const outName = stripExtension(file.name) + "_mobile_1080x1920.mp4";    const baseName = outName.replace(/\.mp4$/, "");
    toast.info("FFmpeg filter ready", {
      description: filterString.slice(0, 120) + "…",
    });
    const [{ API_BASE_URL }, chunkedMod] = await Promise.all([
      import("@/lib/api-client"),
      import("@/lib/upload-chunked"),
    ]);
    const { shouldUseChunked, uploadFileChunked, uploadFormWithProgress } =
      chunkedMod;
    const vs = videoStore;
    setIsExporting(true);
    toast.loading("Exporting mobile mp4 (CRF 10)...", { id: "mobile-export" });
    try {
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
        toast.loading(`Exporting mobile mp4… ${Math.round(progress)}%`, {
          id: "mobile-export",
        });
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
        vs.setState((p) => ({ ...p, uploadStatus: "idle", uploadStage: null }));
      } else {
        toast.error(msg, { id: "mobile-export" });
        vs.setState((p) => ({ ...p, uploadStatus: "error" }));
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
    videoStore,
    layout,
    useWatermark,
    ignoreTrim,
  ]);

  return { onExport, isExporting };
}
