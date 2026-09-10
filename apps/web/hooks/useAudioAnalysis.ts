"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient, type AudioAnalysis } from "@/lib/api-client";

export function useAudioAnalysis(file: File | null, trackIndex: number) {
  return useQuery({
    queryKey: [
      "audio-analysis",
      file?.name,
      file?.size,
      file?.lastModified,
      trackIndex,
    ],
    enabled: !!file,
    queryFn: async () => {
      if (!file) throw new Error("Audio source is required");
      const form = new FormData();
      form.append("file", file);
      return apiClient.formPost<AudioAnalysis>(
        `/api/audio/analysis?track=${trackIndex}`,
        form,
      );
    },
    staleTime: Infinity,
  });
}
