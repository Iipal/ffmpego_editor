"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import type { MobileLayout } from "@/lib/mobile-layout";
import { baseNameOf } from "./helpers";
import type { BulkItem, FsDirHandle } from "./types";
import { fetchDownloadBlob, saveBlobFile } from "@/lib/save-blob-file";
import { awaitTranscodeCompletion } from "@/lib/transcode-progress";
import {
  TranscodeCancelledError,
  throwTranscodeHttpError,
} from "@/lib/transcode-jobs";
import { assertMobileSettings } from "@/lib/validate-settings";

export type UseBulkExportArgs = {
  itemsRef: { current: BulkItem[] };
  stackedLayout: MobileLayout | null;
  layoutError: string | null;
  outputDirHandle: FsDirHandle | null;
  useWatermark: boolean;
  patchItem: (id: string, patch: Partial<BulkItem>) => void;
};

/**
 * Sequential bulk export: upload → transcode (SSE progress) → save.
 * Logic moved verbatim from `app/pageEditorMobileBulk.tsx`.
 */
export function useBulkExport({
  itemsRef,
  stackedLayout,
  layoutError,
  outputDirHandle,
  useWatermark,
  patchItem,
}: UseBulkExportArgs) {
  const [isExporting, setIsExporting] = useState(false);

  const onBulkExport = useCallback(async () => {
    if (isExporting) return;
    if (!stackedLayout || layoutError) {
      toast.error(layoutError ?? "Invalid layout");
      return;
    }
    const queue = itemsRef.current.filter(
      (it) =>
        it.selected &&
        (it.status === "idle" ||
          it.status === "failed" ||
          it.status === "cancelled"),
    );
    if (queue.length === 0) {
      toast.error("Nothing to export — select files first");
      return;
    }
    setIsExporting(true);
    const [{ API_BASE_URL }, chunkedMod] = await Promise.all([
      import("@/lib/api-client"),
      import("@/lib/upload-chunked"),
    ]);
    const { shouldUseChunked, uploadFileChunked, uploadFormWithProgress } =
      chunkedMod;
    let done = 0;
    let failed = 0;

    for (const item of queue) {
      const { id, file } = item;
      const meta = itemsRef.current.find((it) => it.id === id);
      const duration = meta?.duration ?? 0;
      const sw = meta?.width || 1920;
      const sh = meta?.height || 1080;
      const outName = `${baseNameOf(file.name)}_mobile_1080x1920.mp4`;
      const base = baseNameOf(file.name);
      patchItem(id, { status: "uploading", progress: 0, error: null });
      try {
        const settingsJson = JSON.stringify({
          mobileLayout: stackedLayout,
          sourceWidth: sw,
          sourceHeight: sh,
          trimRange: [0, duration > 0 ? duration : 0.001],
          ignoreTrim: true,
          ignoreTrimSettings: true,
          exportFormat: "mp4",
          exportFps: 30,
          exportFilename: base,
          exportQuality: 10,
          exportSpeed: 1,
          customFFmpegArgs: "",
          watermark: useWatermark,
        });
        // Pre-upload: same schemas the API enforces — fail before upload bytes.
        assertMobileSettings(settingsJson);
        let jobId: string;
        let progressUrl: string;
        const onUpload = (sent: number, total: number) =>
          patchItem(id, {
            progress: total ? Math.round((sent / total) * 50) : 0,
          });
        if (shouldUseChunked(file)) {
          const { uploadId } = await uploadFileChunked(file, {
            onProgress: onUpload,
          });
          patchItem(id, { progress: 50 });
          const fd = new FormData();
          fd.append("settings", settingsJson);
          const res = await fetch(`${API_BASE_URL}/api/transcode/mobile`, {
            method: "POST",
            headers: { "x-upload-id": uploadId },
            body: fd,
          });
          if (!res.ok) {
            const payload = (await res.json().catch(() => null)) as {
              error?: string;
            } | null;
            // B2: shapes 429 (queue full + Retry-After) distinctly.
            throwTranscodeHttpError(res, payload);
          }
          const j = (await res.json()) as {
            jobId: string;
            progressUrl: string;
          };
          jobId = j.jobId;
          progressUrl = new URL(j.progressUrl, API_BASE_URL).toString();
        } else {
          const fd = new FormData();
          fd.append("file", file);
          fd.append("settings", settingsJson);
          const j = await uploadFormWithProgress<{
            jobId: string;
            progressUrl: string;
          }>("/api/transcode/mobile", fd, { onUploadProgress: onUpload });
          jobId = j.jobId;
          progressUrl = new URL(j.progressUrl, API_BASE_URL).toString();
        }
        patchItem(id, { status: "processing", progress: 50 });
        await awaitTranscodeCompletion(progressUrl, (progress, info) => {
          // B2: reflect server queue state per item instead of jumping to 50%+.
          if (info?.status === "queued") {
            patchItem(id, { status: "queued", progress: 50 });
          } else {
            patchItem(id, {
              status: "processing",
              progress: 50 + Math.round((progress / 100) * 45),
            });
          }
        });
        patchItem(id, { status: "saving", progress: 97 });
        const blob = await fetchDownloadBlob(
          `${API_BASE_URL}/api/transcode/download/${jobId}`,
        );
        if (outputDirHandle) {
          const fh = await outputDirHandle.getFileHandle(outName, {
            create: true,
          });
          const w = await fh.createWritable();
          await w.write(blob);
          await w.close();
        } else {
          await saveBlobFile(blob, outName);
        }
        patchItem(id, { status: "completed", progress: 100 });
        done++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Export failed";
        if ((e as DOMException)?.name === "AbortError") {
          patchItem(id, { status: "idle", progress: 0 });
        } else if (e instanceof TranscodeCancelledError) {
          // B2: cooperatively cancelled server-side; row kept for inspection.
          patchItem(id, { status: "cancelled", progress: 0, error: msg });
          failed++;
        } else {
          patchItem(id, { status: "failed", progress: 0, error: msg });
          failed++;
        }
      }
    }
    setIsExporting(false);
    if (failed === 0)
      toast.success(`Bulk export done — ${done} file${done === 1 ? "" : "s"}`);
    else
      toast.error(
        `Bulk export finished with ${failed} failure${failed === 1 ? "" : "s"} (${done} ok)`,
      );
  }, [
    isExporting,
    stackedLayout,
    layoutError,
    outputDirHandle,
    useWatermark,
    patchItem,
  ]);

  return { isExporting, onBulkExport };
}
