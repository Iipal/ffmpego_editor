"use client";

import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiClient, type VideoMetadata } from "@/lib/api-client";
import { setSourceState } from "@/store/sourceSlice";
import { cutStore, setCutState } from "@/store/cutSlice";
import {
  shouldUseChunked,
  uploadFileChunked,
  uploadFormWithProgress,
} from "@/lib/upload-chunked";
import { serverErrorMessage } from "@/lib/transcode-jobs";

function setUploadProgress(sent: number, total: number) {
  const pct = total > 0 ? Math.round((sent / total) * 100) : 0;
  setSourceState((p) => ({
    ...p,
    uploadBytesSent: sent,
    uploadBytesTotal: total,
    uploadProgress: pct,
    uploadStatus: "uploading",
  }));
}

// Export prefs captured when a file selection starts a metadata fetch.
// Lets onSuccess tell "user already customized export for this file" apart
// from "still on the previous file's prefs", so pre-filling source-derived
// defaults never clobbers an in-flight user choice.
let selectSnapshot: {
  file: File;
  exportFormat: string;
  exportFps: number;
} | null = null;

export function useVideoMetadataMutation() {
  return useMutation({
    onMutate: (file: File) => {
      // Snapshot the export prefs at select time so onSuccess can pre-fill
      // source-derived defaults without clobbering a choice the user made
      // while ffprobe was still running (e.g. picking webm-tg early).
      selectSnapshot = {
        file,
        exportFormat: cutStore.state.exportFormat,
        exportFps: cutStore.state.exportFps,
      };
      setSourceState((p) => ({
        ...p,
        uploadStage: "metadata",
        uploadStatus: "uploading",
        uploadProgress: 0,
        uploadBytesSent: 0,
        uploadBytesTotal: file.size,
      }));
    },
    mutationFn: async (file: File) => {
      if (shouldUseChunked(file)) {
        const { uploadId } = await uploadFileChunked(file, {
          onProgress: (sent, total) => setUploadProgress(sent, total),
        });
        const res = await fetch(apiClient.url("/api/metadata"), {
          method: "POST",
          headers: { "x-upload-id": uploadId },
        });
        if (!res.ok) {
          const err = (await res.json().catch(() => null)) as unknown;
          throw new Error(
            serverErrorMessage(err) ?? `Metadata failed: ${res.status}`,
          );
        }
        return (await res.json()) as VideoMetadata;
      }
      const form = new FormData();
      form.append("file", file);
      return uploadFormWithProgress<VideoMetadata>("/api/metadata", form, {
        onUploadProgress: (sent, total) => setUploadProgress(sent, total),
      });
    },
    onSuccess: (metadata, file) => {
      const frameRate =
        Number.isFinite(metadata.frameRate) && metadata.frameRate > 0
          ? metadata.frameRate
          : 30;
      const extension = file.name.split(".").pop()?.toLowerCase();
      // mkv is valid input but export stays mp4 by default; map mkv -> mp4
      const exportFormat =
        extension === "mp4" || extension === "webm" || extension === "mov"
          ? extension
          : extension === "mkv"
            ? "mp4"
            : "mp4";

      setSourceState((previous) => {
        if (previous.file !== file) return previous;
        return {
          ...previous,
          duration: metadata.durationSeconds,
          sourceWidth: metadata.width,
          sourceHeight: metadata.height,
          sourceAspectRatio: metadata.width / metadata.height,
          sourceFrameRate: frameRate,
          containerFormat: metadata.containerFormat,
          videoCodec: metadata.videoCodec,
          audioCodec: metadata.audioCodec ?? null,
          bitrateKbps: metadata.bitrateKbps,
          ffprobeReport: metadata.ffprobe,
          uploadProgress: 100,
          uploadStatus: "done",
          uploadStage: null,
        };
      });
      setCutState((previous) => {
        // Pre-fill source-derived defaults only if the user hasn't picked
        // their own export prefs for this file while metadata was loading.
        const untouchedSinceSelect =
          selectSnapshot?.file === file &&
          previous.exportFormat === selectSnapshot.exportFormat &&
          previous.exportFps === selectSnapshot.exportFps;
        return {
          ...previous,
          ...(untouchedSinceSelect
            ? { exportFormat, exportFps: frameRate }
            : null),
        };
      });

      toast.info(`Updated the store ${metadata.bitrateKbps}`);
    },
    onError: (error) => {
      setSourceState((p) => ({ ...p, uploadStatus: "error" }));
      toast.error("Could not read video info.", {
        description:
          error instanceof Error
            ? `${error.message} Is the API running on http://localhost:3100 with ffprobe available?`
            : "Is the API running on http://localhost:3100 with ffprobe available?",
      });
    },
  });
}

export function useExtendedVideoMetadataMutation() {
  return useMutation({
    onMutate: (file: File) => {
      setSourceState((p) => ({
        ...p,
        uploadStage: "metadata",
        uploadStatus: "uploading",
        uploadProgress: 0,
        uploadBytesSent: 0,
        uploadBytesTotal: file.size,
      }));
    },
    mutationFn: async (file: File) => {
      if (shouldUseChunked(file)) {
        const { uploadId } = await uploadFileChunked(file, {
          onProgress: (sent, total) => setUploadProgress(sent, total),
        });
        const res = await fetch(
          apiClient.url(
            "/api/metadata?includeFrames=false&includePackets=false",
          ),
          { method: "POST", headers: { "x-upload-id": uploadId } },
        );
        if (!res.ok) {
          const err = (await res.json().catch(() => null)) as unknown;
          throw new Error(
            serverErrorMessage(err) ?? `Metadata failed: ${res.status}`,
          );
        }
        return (await res.json()) as VideoMetadata;
      }
      const form = new FormData();
      form.append("file", file);
      return uploadFormWithProgress<VideoMetadata>(
        "/api/metadata?includeFrames=false&includePackets=false",
        form,
        {
          onUploadProgress: (sent, total) => setUploadProgress(sent, total),
        },
      );
    },
    onSuccess: (metadata, file) => {
      setSourceState((previous) =>
        previous.file === file
          ? {
              ...previous,
              ffprobeReport: metadata.ffprobe,
              uploadProgress: 100,
              uploadStatus: "done",
              uploadStage: null,
            }
          : previous,
      );
    },
    onError: (error) => {
      setSourceState((p) => ({ ...p, uploadStatus: "error" }));
      toast.error("Could not read extended video info.", {
        description: error instanceof Error ? error.message : undefined,
      });
    },
  });
}
