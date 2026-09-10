"use client";

import { useQuery } from "@tanstack/react-query";
import type { AudioAnalysis } from "@/lib/api-client";
import { audioUpload } from "@/lib/audio-upload";

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
    queryFn: async ({ signal }) => {
      if (!file) throw new Error("Audio source is required");
      // Large files upload once via a reused chunked session; small files
      // keep the direct FormData path.
      return audioUpload.postJson<AudioAnalysis>(
        `/api/audio/analysis?track=${trackIndex}`,
        file,
        { signal },
      );
    },
    staleTime: Infinity,
  });
}
