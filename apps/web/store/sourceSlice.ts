import type { FFprobeReport } from "@repo/types";
import { createStore, type Store } from "@tanstack/store";
import { useSelector } from "@tanstack/react-store";

export interface SourceSlice {
  file: File | null;
  mediaUrl: string | null;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  isMuted: boolean;
  volume: number;
  trimRange: [number, number];
  sourceAspectRatio: number;
  sourceWidth: number;
  sourceHeight: number;
  sourceFrameRate: number;
  containerFormat: string | null;
  videoCodec: string | null;
  audioCodec: string | null;
  bitrateKbps: number;
  ffprobeReport: FFprobeReport | null;
  uploadProgress: number;
  uploadBytesSent: number;
  uploadBytesTotal: number;
  uploadStage: "metadata" | "transcode" | null;
  uploadStatus: "idle" | "uploading" | "done" | "error";
}

export const initialSourceSlice: SourceSlice = {
  file: null,
  mediaUrl: null,
  currentTime: 0,
  duration: 0,
  isPlaying: false,
  isMuted: false,
  volume: 1,
  trimRange: [0, 0],
  sourceAspectRatio: 1,
  sourceWidth: 0,
  sourceHeight: 0,
  sourceFrameRate: 0,
  containerFormat: null,
  videoCodec: null,
  audioCodec: null,
  bitrateKbps: 0,
  ffprobeReport: null,
  uploadProgress: 0,
  uploadBytesSent: 0,
  uploadBytesTotal: 0,
  uploadStage: null,
  uploadStatus: "idle",
};

export const sourceStore = createStore<SourceSlice>(initialSourceSlice);

export function useSourceStore() {
  return useSelector(sourceStore);
}

export function setSourceState(
  updater: (previous: SourceSlice) => SourceSlice,
) {
  sourceStore.setState(updater);
}

const TRIM_STORAGE_KEY = "ffmpeg_editor_trimRange_v1";

export function loadPersistedTrim(): [number, number] | null {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(
      localStorage.getItem(TRIM_STORAGE_KEY) ?? "null",
    ) as unknown;
    if (
      Array.isArray(parsed) &&
      parsed.length === 2 &&
      typeof parsed[0] === "number" &&
      typeof parsed[1] === "number" &&
      Number.isFinite(parsed[0]) &&
      Number.isFinite(parsed[1]) &&
      parsed[0] >= 0 &&
      parsed[1] > parsed[0]
    )
      return [parsed[0], parsed[1]];
  } catch {}
  return null;
}

export function hydrateSourceStore() {
  const trimRange = loadPersistedTrim();
  if (trimRange)
    sourceStore.setState((previous) => ({ ...previous, trimRange }));
}

export function persistTrim(trim: [number, number]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(TRIM_STORAGE_KEY, JSON.stringify(trim));
  } catch {}
}

export function subscribeToTrimPersistence() {
  const subscription = sourceStore.subscribe(() => {
    const trim = sourceStore.state.trimRange;
    if (trim[1] > trim[0] && trim[1] > 0) persistTrim(trim);
  });
  const onStorage = (event: StorageEvent) => {
    if (event.key !== TRIM_STORAGE_KEY || !event.newValue) return;
    const trim = loadPersistedTrim();
    if (trim)
      sourceStore.setState((previous) => ({ ...previous, trimRange: trim }));
  };
  window.addEventListener("storage", onStorage);
  return () => {
    subscription.unsubscribe();
    window.removeEventListener("storage", onStorage);
  };
}

export type SourceStore = Store<SourceSlice>;
