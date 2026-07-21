"use client";

import type { Store } from "@tanstack/store";
import {
  createStoreContext,
  useCreateStore,
  useSelector,
} from "@tanstack/react-store";

export type FFmpegParametersQualityT = "lossless" | "high" | "medium" | "low";

export interface FFmpegParameters {
  format: string;
  quality: FFmpegParametersQualityT;
  startTime?: number;
  endTime?: number;
}

export interface ProcessingJob {
  id: string;
  inputPath: string;
  parameters: FFmpegParameters;
  status: "idle" | "processing" | "completed" | "failed";
  progress: number;
  outputPath?: string;
  error?: string;
}

export interface FFmpegState {
  selectedFile: File | null;
  fileUrl: string | null;
  parameters: FFmpegParameters;
  currentJob: ProcessingJob | null;
  isProcessing: boolean;
}

const initialState: FFmpegState = {
  selectedFile: null,
  fileUrl: null,
  parameters: {
    format: "mp4",
    quality: "lossless",
  },
  currentJob: null,
  isProcessing: false,
};

const { StoreProvider, useStoreContext } = createStoreContext<{
  ffmpegStore: Store<FFmpegState>;
}>();

export { StoreProvider };

export function useCreateFFmpegStore() {
  return useCreateStore(initialState);
}

export function useFFmpegStore() {
  return useStoreContext().ffmpegStore;
}

export function useFFmpegState() {
  return useSelector(useFFmpegStore());
}
