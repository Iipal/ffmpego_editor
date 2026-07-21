"use client";

import { useMutation } from "@tanstack/react-query";
import { apiFormPost, type VideoMetadata } from "@/lib/api-client";
import { useVideoStore } from "@/store/useVideoStore";

export function useVideoMetadataMutation() {
  const videoStore = useVideoStore();

  return useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return apiFormPost<VideoMetadata>("/api/metadata", form);
    },
    onSuccess: (metadata, file) => {
      const frameRate =
        Number.isFinite(metadata.frameRate) && metadata.frameRate > 0
          ? metadata.frameRate
          : "source";
      videoStore.setState((previous) => {
        if (previous.file !== file) return previous;
        return {
          ...previous,
          duration: metadata.durationSeconds,
          sourceWidth: metadata.width,
          sourceHeight: metadata.height,
          sourceAspectRatio: metadata.width / metadata.height,
          sourceFrameRate: typeof frameRate === "number" ? frameRate : 0,
          containerFormat: metadata.containerFormat,
          videoCodec: metadata.videoCodec,
          audioCodec: metadata.audioCodec ?? null,
          bitrateKbps: metadata.bitrateKbps,
          ffprobeReport: metadata.ffprobe,
          exportFormat: "source",
          exportFps: frameRate,
        };
      });
    },
  });
}

export function useExtendedVideoMetadataMutation() {
  const videoStore = useVideoStore();

  return useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return apiFormPost<VideoMetadata>(
        "/api/metadata?includeFrames=false&includePackets=false",
        form,
      );
    },
    onSuccess: (metadata, file) => {
      videoStore.setState((previous) =>
        previous.file === file
          ? { ...previous, ffprobeReport: metadata.ffprobe }
          : previous,
      );
    },
  });
}
