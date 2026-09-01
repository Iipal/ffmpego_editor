"use client";

import type { Store } from "@tanstack/store";
import {
  createStoreContext,
  useCreateStore,
  useSelector,
} from "@tanstack/react-store";
import { useEffect } from "react";
import type { FFprobeReport } from "@/lib/api-client";
import type { Subtitle } from "@/lib/subtitles/subtitleTypes";

const TRIM_STORAGE_KEY = "ffmpeg_editor_trimRange_v1";

function loadPersistedTrim(): [number, number] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(TRIM_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (
      Array.isArray(parsed) &&
      parsed.length === 2 &&
      typeof parsed[0] === "number" &&
      typeof parsed[1] === "number" &&
      Number.isFinite(parsed[0]) &&
      Number.isFinite(parsed[1]) &&
      parsed[0] >= 0 &&
      parsed[1] > parsed[0]
    ) {
      return [parsed[0], parsed[1]];
    }
  } catch {}
  return null;
}

function persistTrim(trim: [number, number]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(TRIM_STORAGE_KEY, JSON.stringify(trim));
  } catch {}
}

export function clampTrimToDuration(
  trim: [number, number],
  duration: number,
): [number, number] {
  if (!Number.isFinite(duration) || duration <= 0) return trim;
  const s = Math.max(0, Math.min(trim[0], duration - 0.01));
  const e = Math.max(s + 0.01, Math.min(trim[1], duration));
  if (trim[1] === 0) return [0, duration];
  return [s, e];
}

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
  subtitles: Subtitle[];
  selectedSubtitleId: string | null;
  subtitleTrackCountExplicit: number;
  uploadProgress: number;
  uploadBytesSent: number;
  uploadBytesTotal: number;
  uploadStage: "metadata" | "transcode" | null;
  uploadStatus: "idle" | "uploading" | "done" | "error";
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
  canvasZoom: 1,
  canvasOffset: { x: 0, y: 0 },
  exportFormat: "mp4",
  exportFps: 30,
  exportFilename: "",
  exportQuality: 5,
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
  subtitles: [],
  selectedSubtitleId: null,
  subtitleTrackCountExplicit: 1,
  uploadProgress: 0,
  uploadBytesSent: 0,
  uploadBytesTotal: 0,
  uploadStage: null,
  uploadStatus: "idle",
};

const { StoreProvider, useStoreContext } = createStoreContext<{
  videoStore: Store<VideoState>;
}>();

export { StoreProvider as VideoStoreProvider };

export function useCreateVideoStore() {
  // Hydrate trimRange from localStorage so navigating Crop↔Mobile↔Subtitles (same tab) and
  // reloads restore the user's last trim before duration is known; clamping happens
  // once duration resolves (VideoPlayer + page effects).
  const hydrated: VideoState = (() => {
    const t = loadPersistedTrim();
    if (t) return { ...initialState, trimRange: t };
    return initialState;
  })();
  const store = useCreateStore(hydrated);

  // Persist trimRange locally and keep tabs in sync via storage event.
  // We use an effect inside a helper hook pattern: caller must invoke usePersistTrim.
  return store;
}

/** Call once near store provider to enable cross-tab persistence. No-op on server. */
export function usePersistTrim(store: Store<VideoState>) {
  useEffect(() => {
    const sub = store.subscribe(() => {
      const s = store.state as VideoState;
      // Don't persist sentinel [0,0] (no duration yet) — only real user trims
      if (s.trimRange[1] > s.trimRange[0] && s.trimRange[1] > 0) {
        persistTrim(s.trimRange);
      }
    });
    const onStorage = (e: StorageEvent) => {
      if (e.key !== TRIM_STORAGE_KEY || !e.newValue) return;
      const t = loadPersistedTrim();
      if (!t) return;
      const cur = (store.state as VideoState).trimRange;
      if (cur[0] !== t[0] || cur[1] !== t[1]) {
        store.setState((prev) => ({ ...prev, trimRange: t }));
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      // TanStack Store returns { unsubscribe } not a function
      try {
        (sub as unknown as { unsubscribe?: () => void })?.unsubscribe?.();
        (sub as unknown as (() => void) | null)?.call?.(null);
      } catch {}
      window.removeEventListener("storage", onStorage);
    };
  }, [store]);
}

export function useVideoStore() {
  return useStoreContext().videoStore;
}

export function useVideoState() {
  return useSelector(useVideoStore());
}
