"use client";

import type { Store } from "@tanstack/store";
import {
  createStoreContext,
  useCreateStore,
  useSelector,
} from "@tanstack/react-store";
import type { FFprobeReport } from "@/lib/api-client";

export interface VideoState {
  file: File | null;
  mediaUrl: string | null;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  isMuted: boolean;
  volume: number;
  trimRange: [number, number];
  crop: { x: number; y: number; width: number; height: number };
  aspectRatio: "custom" | "1:1" | "16:9" | "21:9";
  isCropMode: boolean;
  isAutoZoomEnabled: boolean;
  canvasZoom: number;
  canvasOffset: { x: number; y: number };
  exportFormat: "mp4" | "webm" | "mov";
  exportFps: number;
  exportFilename: string;
  exportQuality: number;
  playbackSpeed: number;
  exportSpeed: number;
  isLoopEnabled: boolean;
  customFFmpegArgs: string;
  sourceAspectRatio: number;
  sourceWidth: number;
  sourceHeight: number;
  sourceFrameRate: number;
  containerFormat: string | null;
  videoCodec: string | null;
  audioCodec: string | null;
  bitrateKbps: number;
  ffprobeReport: FFprobeReport | null;
  isSidebarOpen: boolean;
  transcodeStatus: "idle" | "processing" | "completed" | "failed";
  transcodeProgress: number;
  transcodeOutputPath: string | null;
  transcodeError: string | null;
}

const initialState: VideoState = {
  file: null,
  mediaUrl: null,
  currentTime: 0,
  duration: 0,
  isPlaying: false,
  isMuted: false,
  volume: 1,
  trimRange: [0, 0],
  crop: { x: 0, y: 0, width: 100, height: 100 },
  aspectRatio: "custom",
  isCropMode: false,
  isAutoZoomEnabled: false,
  canvasZoom: 1,
  canvasOffset: { x: 0, y: 0 },
  exportFormat: "mp4",
  exportFps: 30,
  exportFilename: "",
  exportQuality: 23,
  playbackSpeed: 1,
  exportSpeed: 1,
  isLoopEnabled: false,
  customFFmpegArgs: "",
  sourceAspectRatio: 1,
  sourceWidth: 0,
  sourceHeight: 0,
  sourceFrameRate: 0,
  containerFormat: null,
  videoCodec: null,
  audioCodec: null,
  bitrateKbps: 0,
  ffprobeReport: null,
  isSidebarOpen: true,
  transcodeStatus: "idle",
  transcodeProgress: 0,
  transcodeOutputPath: null,
  transcodeError: null,
};

const { StoreProvider, useStoreContext } = createStoreContext<{
  videoStore: Store<VideoState>;
}>();

export { StoreProvider as VideoStoreProvider };

export function useCreateVideoStore() {
  return useCreateStore(initialState);
}

export function useVideoStore() {
  return useStoreContext().videoStore;
}

export function useVideoState() {
  return useSelector(useVideoStore());
}
