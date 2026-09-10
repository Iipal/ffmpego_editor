"use client";

import type { RefObject } from "react";
import {
  usePlaybackEngine,
  type UsePlaybackEngineOptions,
  type UsePlaybackEngineResult,
} from "./usePlaybackEngine";

export type UseVideoPlayerOptions = UsePlaybackEngineOptions;
export type UseVideoPlayerResult = UsePlaybackEngineResult;

/**
 * Shared video-element transport state.
 *
 * Compatibility wrapper over {@link usePlaybackEngine} — new code should
 * import the engine directly. Kept so existing `useVideoPlayer` call sites
 * (mobile, bulk, cut) keep working unchanged.
 */
export function useVideoPlayer(
  videoRef: RefObject<HTMLVideoElement | null>,
  options: UseVideoPlayerOptions = {},
): UseVideoPlayerResult {
  return usePlaybackEngine(videoRef, options);
}
