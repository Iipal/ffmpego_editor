// Global playback bus: single-key shortcuts and the command palette drive
// transport through here instead of reaching into page-local player hooks.
// All pages play through the shared engine (`shared/usePlaybackEngine` —
// `shared/useVideoPlayer` is a compat alias, `subtitles/useVideoPlayback`
// and `cut/useCutPlayback` are thin wrappers, crop `VideoPlayer` uses it
// directly) and mirror state into `sourceStore`, so operating on the
// active element + the store works uniformly across crop/mobile/subtitles/
// bulk/cut.

import { mobileLayoutService } from "@/lib/mobile-layout";
import { setSourceState, sourceStore } from "@/store/sourceSlice";
import { commitPlayheadTime, getPlayheadTime } from "@/store/playheadSlice";
import { setMobileState } from "@/store/mobileSlice";

/**
 * Singleton service owning global transport: shortcuts and the command
 * palette drive playback/trim through here instead of reaching into
 * page-local player hooks. All DOM/store access lives here (never in the
 * callers), so every page stays interchangeable — the
 * bus operates on the active `<video>` under `<main>` plus `sourceStore`,
 * which every page mirrors.
 */
class PlaybackBus {
  /** Min trim length (s) preserved by the I/O playhead actions. */
  private static readonly TRIM_MIN_GAP = 0.2;

  // ------------------------------------------------------------------ public

  /** Space — toggle the active video, no-op when none is on screen. */
  togglePlay(): void {
    const video = this.getActiveVideo();
    if (!video) return;
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  }

  /** Play the active video, no-op when none is on screen. */
  play(): void {
    this.getActiveVideo()
      ?.play()
      .catch(() => {});
  }

  /** Pause the active video, no-op when none is on screen. */
  pause(): void {
    this.getActiveVideo()?.pause();
  }

  /** Relative seek (J/L, arrows). Positive = forward. */
  seekBy(deltaSeconds: number): void {
    const video = this.getActiveVideo();
    this.commitSeek(video, this.readTime(video) + deltaSeconds);
  }

  /** Single-frame step (`,`/`.` or Shift+arrows). Pauses first, NLE-style. */
  stepFrame(direction: 1 | -1): void {
    const video = this.getActiveVideo();
    if (video && !video.paused) video.pause();
    const fps = sourceStore.state.sourceFrameRate;
    const step = fps > 0 && Number.isFinite(fps) ? 1 / fps : 1 / 30;
    const video2 = video ?? this.getActiveVideo();
    this.commitSeek(video2, this.readTime(video2) + direction * step);
  }

  /**
   * I — set trim start to the playhead (min gap preserved). Returns false
   * when the playhead is already past the clamp bound (nothing to set).
   */
  setTrimInToPlayhead(): boolean {
    const video = this.getActiveVideo();
    const t = this.readTime(video);
    const cur = sourceStore.state.trimRange;
    const next = mobileLayoutService.clamp(
      t,
      0,
      cur[1] - PlaybackBus.TRIM_MIN_GAP,
    );
    if (next >= cur[1] - PlaybackBus.TRIM_MIN_GAP && t > next) return false;
    setSourceState((previous) => ({ ...previous, trimRange: [next, cur[1]] }));
    return true;
  }

  /**
   * O — set trim end to the playhead (min gap preserved). Returns false
   * when the playhead is already before the clamp bound (nothing to set).
   */
  setTrimOutToPlayhead(): boolean {
    const video = this.getActiveVideo();
    const t = this.readTime(video);
    const cur = sourceStore.state.trimRange;
    const duration =
      (video && Number.isFinite(video.duration) ? video.duration : 0) ||
      sourceStore.state.duration ||
      0;
    const next = mobileLayoutService.clamp(
      t,
      cur[0] + PlaybackBus.TRIM_MIN_GAP,
      duration,
    );
    if (next <= cur[0] + PlaybackBus.TRIM_MIN_GAP && t < next) return false;
    setSourceState((previous) => ({ ...previous, trimRange: [cur[0], next] }));
    return true;
  }

  /** Reset trim to the full media length. No-op when duration is unknown. */
  clearTrim(): void {
    const duration =
      sourceStore.state.duration || this.getActiveVideo()?.duration || 0;
    if (!(duration > 0)) return;
    setSourceState((previous) => ({ ...previous, trimRange: [0, duration] }));
  }

  /** Flip the global muted flag in `sourceStore`. */
  toggleMute(): void {
    setSourceState((previous) => ({
      ...previous,
      isMuted: !previous.isMuted,
    }));
  }

  /** Flip loop playback in `mobileSlice`. */
  toggleLoop(): void {
    setMobileState((previous) => ({
      ...previous,
      isLoopEnabled: !previous.isLoopEnabled,
    }));
  }

  // ----------------------------------------------------------------- private

  /**
   * The video element currently on screen (first `<video>` under `<main>`,
   * falling back to any `<video>`). Null on the server or with no player.
   */
  private getActiveVideo(): HTMLVideoElement | null {
    if (typeof document === "undefined") return null;
    const scoped = document.querySelector("main video");
    if (scoped instanceof HTMLVideoElement) return scoped;
    const any = document.querySelector("video");
    return any instanceof HTMLVideoElement ? any : null;
  }

  /** Playhead of the active video, or the transient playhead as fallback. */
  private readTime(video: HTMLVideoElement | null): number {
    if (video) return video.currentTime;
    return getPlayheadTime();
  }

  /**
   * Clamp a seek target to the media duration and apply it to both the
   * element and the committed playhead (transient + source snapshot).
   */
  private commitSeek(video: HTMLVideoElement | null, time: number): void {
    const duration =
      (video && Number.isFinite(video.duration) ? video.duration : 0) ||
      sourceStore.state.duration ||
      0;
    const t =
      duration > 0
        ? mobileLayoutService.clamp(time, 0, Math.max(0.01, duration))
        : time;
    if (video) video.currentTime = t;
    commitPlayheadTime(t);
  }
}

/** App-wide singleton — shortcuts and the palette drive through this bus. */
export const playbackBus = new PlaybackBus();
