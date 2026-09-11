import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import type { VideoMetadata } from "@/lib/api-client";
import { setSourceState } from "@/store/sourceSlice";
import { cutStore, setCutState } from "@/store/cutSlice";
import { uploadChunked } from "@/lib/upload-chunked";
import { videoFileService } from "@/lib/video-file";
import { transcodeJobs } from "@/lib/transcode-jobs";

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

// Shared probe-start reset: both metadata mutations put the source slice
// back into the uploading stage before ffprobe runs.
function resetUploadStage(totalBytes: number) {
  setSourceState((p) => ({
    ...p,
    uploadStage: "metadata",
    uploadStatus: "uploading",
    uploadProgress: 0,
    uploadBytesSent: 0,
    uploadBytesTotal: totalBytes,
  }));
}

export interface ProbeDepth {
  includeFrames?: boolean;
  includePackets?: boolean;
}

// Shared POST /metadata fetch: chunked uploadId reuse for big files, direct
// multipart otherwise. `?includeFrames/includePackets` ask ffprobe for deep
// per-frame/per-packet dumps (large, slow) — omitted by default.
async function fetchVideoMetadata(
  file: File,
  depth: ProbeDepth = {},
): Promise<VideoMetadata> {
  const params = new URLSearchParams();
  if (depth.includeFrames) params.set("includeFrames", "true");
  if (depth.includePackets) params.set("includePackets", "true");
  const query = params.size ? `?${params}` : "";
  return uploadChunked.submitWithUpload<VideoMetadata>(
    `/api/metadata${query}`,
    {
      file,
      onProgress: (sent, total) => setUploadProgress(sent, total),
      // Chunked probe is bodiless (the server resolves the session header);
      // direct probe carries the file in the FormData.
      buildForm: (includeFile) => {
        if (!includeFile) return null;
        const form = new FormData();
        form.append("file", file);
        return form;
      },
      shapeError: (res, payload) =>
        transcodeJobs.throwTranscodeHttpError(res, payload),
    },
  );
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
      resetUploadStage(file.size);
    },
    mutationFn: async (file: File) => fetchVideoMetadata(file),
    onSuccess: (metadata, file) => {
      const frameRate =
        Number.isFinite(metadata.frameRate) && metadata.frameRate > 0
          ? metadata.frameRate
          : 30;
      const extension = videoFileService.getFileExtension(file.name);
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

export interface ExtendedMetadataVariables extends ProbeDepth {
  file: File;
}

export function useExtendedVideoMetadataMutation() {
  return useMutation({
    onMutate: (vars: ExtendedMetadataVariables) => {
      resetUploadStage(vars.file.size);
    },
    mutationFn: async (vars: ExtendedMetadataVariables) =>
      fetchVideoMetadata(vars.file, vars),
    onSuccess: (metadata, vars) => {
      setSourceState((previous) =>
        previous.file === vars.file
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
