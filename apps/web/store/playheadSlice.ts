"use client";

import { createAtom } from "@tanstack/store";
import { useSelector } from "@tanstack/react-store";

import { sourceStore, setSourceState } from "@/store/sourceSlice";

/**
 * Isolated playhead clock.
 *
 * The playhead is intentionally stored as a single number because there is
 * only one piece of transient state: the current playback time in seconds.
 *
 * - Per-frame ticks write ONLY to `playheadAtom`.
 * - `sourceStore.currentTime` is a committed snapshot updated on seek /
 *   pause / ended / loop-clamp / file-reset.
 * - Live React UI reads via `usePlayheadTime()`.
 * - Imperative/transient consumers can use `subscribeToPlayhead()` without
 *   causing React re-renders.
 */
export const playheadAtom = createAtom<number>(0);

/**
 * Live playhead for React rendering.
 *
 * Components using this hook re-render only when the playhead value changes.
 */
export function usePlayheadTime(): number {
  return useSelector(playheadAtom);
}

/**
 * Imperative read for event handlers.
 *
 * No subscription and no React re-render.
 */
export function getPlayheadTime(): number {
  return playheadAtom.get();
}

/**
 * Per-frame tick.
 *
 * Updates ONLY the transient playhead atom.
 * Never touches `sourceStore`, so non-playhead subscribers remain idle
 * while the video is playing.
 */
export function setPlayheadTime(time: number): void {
  if (!Number.isFinite(time)) return;

  if (playheadAtom.get() !== time) {
    playheadAtom.set(time);
  }
}

/**
 * Committed seek/pause/ended update.
 *
 * Keeps the transient playhead and `sourceStore.currentTime` snapshot
 * synchronized.
 *
 * Use for:
 * - seeks
 * - loop clamps
 * - pause
 * - ended
 * - file resets
 *
 * Do NOT use this for per-frame playback ticks.
 */
export function commitPlayheadTime(time: number): void {
  if (!Number.isFinite(time)) return;

  setPlayheadTime(time);

  setSourceState((previous) =>
    previous.currentTime === time
      ? previous
      : { ...previous, currentTime: time },
  );
}

/**
 * Reset both clocks, e.g. when loading a new file.
 */
export function resetPlayheadTime(time = 0): void {
  commitPlayheadTime(time);
}

/**
 * Transient subscription for high-frequency DOM updates without React
 * re-renders.
 *
 * Useful for:
 * - canvas playheads
 * - slider markers
 * - waveform cursors
 * - direct style updates
 *
 * The listener executes outside React.
 */
export function subscribeToPlayhead(
  listener: (time: number) => void,
): () => void {
  let last = playheadAtom.get();

  const subscription = playheadAtom.subscribe(() => {
    const next = playheadAtom.get();

    if (next !== last) {
      last = next;
      listener(next);
    }
  });

  return () => subscription.unsubscribe();
}

/**
 * Committed snapshot for code paths without a video element.
 */
export function getCommittedTime(): number {
  return sourceStore.state.currentTime;
}
