"use client";

import { useMutation } from "@tanstack/react-query";
import { API_BASE_URL, type VideoMetadata } from "@/lib/api-client";
import { useVideoStore } from "@/store/useVideoStore";
import {
  shouldUseChunked,
  uploadFileChunked,
  uploadFormWithProgress,
} from "@/lib/upload-chunked";

function setUploadProgress(
  videoStore: ReturnType<typeof useVideoStore>,
  sent: number,
  total: number,
) {
  const pct = total > 0 ? Math.round((sent / total) * 100) : 0;
  videoStore.setState((p) => ({
    ...p,
    uploadBytesSent: sent,
    uploadBytesTotal: total,
    uploadProgress: pct,
    uploadStatus: "uploading",
  }));
}

export function useVideoMetadataMutation() {
  const videoStore = useVideoStore();

  return useMutation({
    onMutate: (file: File) => {
      videoStore.setState((p) => ({
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
          onProgress: (sent, total) => setUploadProgress(videoStore, sent, total),
        });
        const res = await fetch(`${API_BASE_URL}/api/metadata`, {
          method: "POST",
          headers: { "x-upload-id": uploadId },
        });
        if (!res.ok) {
          const err = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(err?.error ?? `Metadata failed: ${res.status}`);
        }
        return (await res.json()) as VideoMetadata;
      }
      const form = new FormData();
      form.append("file", file);
      return uploadFormWithProgress<VideoMetadata>("/api/metadata", form, {
        onUploadProgress: (sent, total) => setUploadProgress(videoStore, sent, total),
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

      videoStore.setState((previous) => {
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
          exportFormat,
          exportFps: frameRate,
          uploadProgress: 100,
          uploadStatus: "done",
          uploadStage: null,
        };
      });
    },
    onError: () => {
      videoStore.setState((p) => ({ ...p, uploadStatus: "error" }));
    },
  });
}

export function useExtendedVideoMetadataMutation() {
  const videoStore = useVideoStore();

  return useMutation({
    onMutate: (file: File) => {
      videoStore.setState((p) => ({
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
          onProgress: (sent, total) => setUploadProgress(videoStore, sent, total),
        });
        const res = await fetch(
          `${API_BASE_URL}/api/metadata?includeFrames=false&includePackets=false`,
          { method: "POST", headers: { "x-upload-id": uploadId } },
        );
        if (!res.ok) {
          const err = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(err?.error ?? `Metadata failed: ${res.status}`);
        }
        return (await res.json()) as VideoMetadata;
      }
      const form = new FormData();
      form.append("file", file);
      return uploadFormWithProgress<VideoMetadata>(
        "/api/metadata?includeFrames=false&includePackets=false",
        form,
        { onUploadProgress: (sent, total) => setUploadProgress(videoStore, sent, total) },
      );
    },
    onSuccess: (metadata, file) => {
      videoStore.setState((previous) =>
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
    onError: () => {
      videoStore.setState((p) => ({ ...p, uploadStatus: "error" }));
    },
  });
}
