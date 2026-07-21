"use client";

import { useMutation } from "@tanstack/react-query";
import {
  API_BASE_URL,
  apiFormPost,
  type TranscodeProgress,
  type TranscodeResponse,
} from "@/lib/api-client";
import { useVideoStore, type VideoState } from "@/store/useVideoStore";

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

export function useTranscodeMutation() {
  const videoStore = useVideoStore();

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
    onSuccess: (result) => {
      videoStore.setState((previous) => ({
        ...previous,
        transcodeStatus: "completed",
        transcodeProgress: 100,
        transcodeOutputPath: result.outputPath,
      }));
    },
    onError: (error) => {
      videoStore.setState((previous) => ({
        ...previous,
        transcodeStatus: "failed",
        transcodeError:
          error instanceof Error ? error.message : "Export failed.",
      }));
    },
  });
}
