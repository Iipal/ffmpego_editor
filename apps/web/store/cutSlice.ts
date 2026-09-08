import { createStore } from "@tanstack/store";
import { useSelector } from "@tanstack/react-store";

export interface CutSlice {
  exportFormat: "mp4" | "webm" | "mov" | "webm-tg" | "gif";
  exportFps: number;
  exportFilename: string;
  exportQuality: number;
  playbackSpeed: number;
  exportSpeed: number;
  customFFmpegArgs: string;
  watermark: boolean;
  ignoreTrim: boolean;
  audioTrackIndex: number;
  isSidebarOpen: boolean;
  transcodeStatus:
    | "idle"
    | "queued"
    | "processing"
    | "completed"
    | "failed"
    | "cancelled";
  transcodeProgress: number;
  transcodeOutputPath: string | null;
  transcodeError: string | null;
  transcodeJobId: string | null;
  transcodeQueuePosition: number | null;
  transcodeLogTail: string | null;
}

export const initialCutSlice: CutSlice = {
  exportFormat: "mp4",
  exportFps: 30,
  exportFilename: "",
  exportQuality: 5,
  playbackSpeed: 1,
  exportSpeed: 1,
  customFFmpegArgs: "",
  watermark: false,
  ignoreTrim: false,
  audioTrackIndex: 0,
  isSidebarOpen: true,
  transcodeStatus: "idle",
  transcodeProgress: 0,
  transcodeOutputPath: null,
  transcodeError: null,
  transcodeJobId: null,
  transcodeQueuePosition: null,
  transcodeLogTail: null,
};

export const cutStore = createStore<CutSlice>(initialCutSlice);

export function useCutStore() {
  return useSelector(cutStore);
}

export function setCutState(updater: (previous: CutSlice) => CutSlice) {
  cutStore.setState(updater);
}
