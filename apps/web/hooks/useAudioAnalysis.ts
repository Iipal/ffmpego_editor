import { useQuery } from "@tanstack/react-query";
import type { AudioAnalysis } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { uploadChunked } from "@/lib/upload-chunked";

export function useAudioAnalysis(file: File | null, trackIndex: number) {
  return useQuery({
    queryKey: queryKeys.audioAnalysis(file, trackIndex),
    enabled: !!file,
    queryFn: async ({ signal }) => {
      if (!file) throw new Error("Audio source is required");
      // Large files upload once via a reused chunked session; small files
      // keep the direct FormData path.
      return uploadChunked.postJson<AudioAnalysis>(
        `/api/audio/analysis?track=${trackIndex}`,
        file,
        { signal },
      );
    },
    staleTime: Infinity,
  });
}
