import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "./query-keys";
import { uploadChunked } from "../upload-chunked";

/** Waveform/loudness report returned by `POST /api/audio/analysis`. */
export interface AudioAnalysis {
  duration: number;
  sampleRate: number;
  peaks: number[];
  rms: number[];
  tracks: Array<{
    trackIndex: number;
    streamIndex: number;
    codec: string | null;
    codecLongName: string | null;
    language: string | null;
    title: string | null;
    channels: number;
    sampleRate: number;
  }>;
  selectedTrack: number;
  loudness: {
    inputIntegratedLufs: number;
    inputTruePeak: number;
    inputLra: number;
    targetIntegratedLufs: number;
  } | null;
}

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
