// Global playback bus: single-key shortcuts and the command palette drive
// transport through here instead of reaching into page-local player hooks.
// The three player implementations (`shared/useVideoPlayer`,
// `subtitles/useVideoPlayback`, `cut/useCutPlayback`) all render a <video>
// inside <main> and mirror state into `sourceStore`, so operating on the
// active element + the store works uniformly across crop/mobile/subtitles/
// bulk/cut without unifying the hooks first.

import { mobileLayoutService } from "@/lib/mobile-layout";
import { setSourceState, sourceStore } from "@/store/sourceSlice";
import { setMobileState } from "@/store/mobileSlice";

export const TRIM_MIN_GAP = 0.2;

/** The video element currently on screen (first <video> under <main>). */
export function getActiveVideo(): HTMLVideoElement | null {
  if (typeof document === "undefined") return null;
  const scoped = document.querySelector("main video");
  if (scoped instanceof HTMLVideoElement) return scoped;
  const any = document.querySelector("video");
  return any instanceof HTMLVideoElement ? any : null;
}

function readTime(video: HTMLVideoElement | null): number {
  if (video) return video.currentTime;
  return sourceStore.state.currentTime;
}

function commitSeek(video: HTMLVideoElement | null, time: number) {
  const duration =
    (video && Number.isFinite(video.duration) ? video.duration : 0) ||
    sourceStore.state.duration ||
    0;
  const t =
    duration > 0
      ? mobileLayoutService.clamp(time, 0, Math.max(0.01, duration))
      : time;
  if (video) video.currentTime = t;
  setSourceState((previous) =>
    previous.currentTime === t ? previous : { ...previous, currentTime: t },
  );
}

export function togglePlay() {
  const video = getActiveVideo();
  if (!video) return;
  if (video.paused) video.play().catch(() => {});
  else video.pause();
}

export function play() {
  getActiveVideo()
    ?.play()
    .catch(() => {});
}

export function pause() {
  getActiveVideo()?.pause();
}

/** Relative seek (J/L, arrows). Positive = forward. */
export function seekBy(deltaSeconds: number) {
  const video = getActiveVideo();
  commitSeek(video, readTime(video) + deltaSeconds);
}

/** Single-frame step (`,`/`.` or Shift+arrows). Pauses first, NLE-style. */
export function stepFrame(direction: 1 | -1) {
  const video = getActiveVideo();
  if (video && !video.paused) video.pause();
  const fps = sourceStore.state.sourceFrameRate;
  const step = fps > 0 && Number.isFinite(fps) ? 1 / fps : 1 / 30;
  const video2 = video ?? getActiveVideo();
  commitSeek(video2, readTime(video2) + direction * step);
}

/** I — set trim start to the playhead (min 0.2 s gap preserved). */
export function setTrimInToPlayhead(): boolean {
  const video = getActiveVideo();
  const t = readTime(video);
  const cur = sourceStore.state.trimRange;
  const next = mobileLayoutService.clamp(t, 0, cur[1] - TRIM_MIN_GAP);
  if (next >= cur[1] - TRIM_MIN_GAP && t > next) return false;
  setSourceState((previous) => ({ ...previous, trimRange: [next, cur[1]] }));
  return true;
}

/** O — set trim end to the playhead (min 0.2 s gap preserved). */
export function setTrimOutToPlayhead(): boolean {
  const video = getActiveVideo();
  const t = readTime(video);
  const cur = sourceStore.state.trimRange;
  const duration =
    (video && Number.isFinite(video.duration) ? video.duration : 0) ||
    sourceStore.state.duration ||
    0;
  const next = mobileLayoutService.clamp(t, cur[0] + TRIM_MIN_GAP, duration);
  if (next <= cur[0] + TRIM_MIN_GAP && t < next) return false;
  setSourceState((previous) => ({ ...previous, trimRange: [cur[0], next] }));
  return true;
}

/** Reset trim to the full media length. */
export function clearTrim() {
  const duration =
    sourceStore.state.duration || getActiveVideo()?.duration || 0;
  if (!(duration > 0)) return;
  setSourceState((previous) => ({ ...previous, trimRange: [0, duration] }));
}

export function toggleMute() {
  setSourceState((previous) => ({ ...previous, isMuted: !previous.isMuted }));
}

export function toggleLoop() {
  setMobileState((previous) => ({
    ...previous,
    isLoopEnabled: !previous.isLoopEnabled,
  }));
}
