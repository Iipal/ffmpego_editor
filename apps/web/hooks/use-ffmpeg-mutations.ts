"use client";

import { useMutation } from "@tanstack/react-query";
import {
  API_BASE_URL,
  apiFormPost,
  type TranscodeProgress,
  type TranscodeResponse,
} from "@/lib/api-client";
import { useVideoStore, useVideoState, type VideoState } from "@/store/useVideoStore";

type TranscodeRequest = Pick<
  VideoState,
  | "crop"
  | "customFFmpegArgs"
  | "exportFormat"
  | "exportFps"
  | "exportFilename"
  | "exportQuality"
  | "exportSpeed"
  | "sourceHeight"
  | "sourceWidth"
  | "trimRange"
> & { file: File };

/**
 * Download the transcode output file and prompt the user to save it using
 * the File System Access API (showSaveFilePicker).
 */
async function downloadAndSaveFile(jobId: string, filename: string) {
  const downloadUrl = `${API_BASE_URL}/api/transcode/download/${jobId}`;
  const response = await fetch(downloadUrl);

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => null);
    throw new Error(
      errorPayload?.error ?? `Download failed: ${response.status}`,
    );
  }

  const blob = await response.blob();

  // Determine the MIME type from the file extension.
  const ext = filename.split(".").pop()?.toLowerCase() || "mp4";
  let mimeType = "application/octet-stream";
  if (ext === "mp4") mimeType = "video/mp4";
  else if (ext === "webm") mimeType = "video/webm";
  else if (ext === "mov") mimeType = "video/quicktime";

  // Attempt to use the File System Access API for a native save dialog.
  // Must be called within user activation – after async SSE it will throw NotAllowedError, so fall back to anchor.
  if ("showSaveFilePicker" in window) {
    try {
      const handle = await (
        window as unknown as {
          showSaveFilePicker: (options: { suggestedName?: string; types?: Array<{ description?: string; accept: Record<string, string[]> }> }) => Promise<FileSystemFileHandle>;
        }
      ).showSaveFilePicker({
        suggestedName: filename,
        types: [
          {
            description: `Video file (.${ext})`,
            accept: { [mimeType]: [`.${ext}`] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return handle.name;
    } catch (e) {
      // User cancelled – bubble as AbortError so caller can ignore
      if ((e as DOMException)?.name === "AbortError") throw e;
      // NotAllowedError (no transient activation) or other – fall through to anchor fallback
      console.warn("showSaveFilePicker failed, falling back to download:", e);
    }
  }

  // Fallback: trigger a browser download. This works without transient activation.
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Delay revocation to allow browser to start download
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return filename;
}

export function useTranscodeMutation() {
  const videoStore = useVideoStore();
  const { exportFilename, exportFormat } = useVideoState();

  return useMutation({
    mutationFn: async (request: TranscodeRequest) => {
      const form = new FormData();
      console.log(request);
      form.append("file", request.file);
      form.append(
        "settings",
        JSON.stringify({
          crop: request.crop,
          customFFmpegArgs: request.customFFmpegArgs,
          exportFormat: request.exportFormat,
          exportFps: request.exportFps,
          exportFilename: request.exportFilename,
          exportQuality: request.exportQuality,
          exportSpeed: request.exportSpeed,
          sourceHeight: request.sourceHeight,
          sourceWidth: request.sourceWidth,
          trimRange: request.trimRange,
        }),
      );
      const response = await apiFormPost<TranscodeResponse>(
        "/api/transcode",
        form,
      );
      const progressUrl = new URL(
        response.progressUrl,
        API_BASE_URL,
      ).toString();

      return new Promise<TranscodeProgress>((resolve, reject) => {
        const source = new EventSource(progressUrl);
        source.onmessage = (event) => {
          const progress = JSON.parse(event.data) as TranscodeProgress;
          videoStore.setState((previous) => ({
            ...previous,
            transcodeProgress: progress.progress,
          }));
          if (progress.status === "completed") {
            source.close();
            resolve(progress);
          }
          if (progress.status === "failed") {
            source.close();
            reject(new Error(progress.error ?? "Export failed."));
          }
        };
        source.onerror = () => {
          source.close();
          reject(new Error("Lost connection to the export progress stream."));
        };
      });
    },
    onMutate: () => {
      videoStore.setState((previous) => ({
        ...previous,
        transcodeStatus: "processing",
        transcodeProgress: 0,
        transcodeOutputPath: null,
        transcodeError: null,
      }));
    },
    onSuccess: async (result) => {
      // Use fresh store state to avoid stale closure on exportFilename/format
      const fresh = (videoStore as unknown as { state: VideoState }).state;
      const freshName = fresh?.exportFilename;
      const freshFormat = fresh?.exportFormat;
      const filename = `${freshName || exportFilename}.${freshFormat || exportFormat}`;
      let savedName: string | undefined;

      try {
        savedName = await downloadAndSaveFile(result.jobId, filename);
      } catch (error) {
        if ((error as DOMException)?.name === "AbortError") {
          // User cancelled picker – treat as success, keep file available via download endpoint
          videoStore.setState((previous) => ({
            ...previous,
            transcodeStatus: "completed",
            transcodeProgress: 100,
            transcodeOutputPath: filename,
          }));
          return;
        }
        videoStore.setState((previous) => ({
          ...previous,
          transcodeStatus: "failed",
          transcodeError:
            error instanceof Error ? error.message : "Download failed.",
        }));
        return;
      }

      videoStore.setState((previous) => ({
        ...previous,
        transcodeStatus: "completed",
        transcodeProgress: 100,
        transcodeOutputPath: savedName ?? filename,
      }));
    },
    onError: (error) => {
      if ((error as DOMException)?.name === "AbortError") {
        videoStore.setState((previous) => ({
          ...previous,
          transcodeStatus: "idle",
          transcodeProgress: 0,
        }));
        return;
      }
      videoStore.setState((previous) => ({
        ...previous,
        transcodeStatus: "failed",
        transcodeError:
          error instanceof Error ? error.message : "Export failed.",
      }));
    },
  });
}
