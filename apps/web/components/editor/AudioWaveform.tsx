"use client";

import { useEffect, useRef } from "react";
import { useAudioAnalysis } from "@/lib/query-hooks";
import { setAudioState } from "@/store/audioSlice";

export function AudioWaveform({
  file,
  trackIndex,
  duration,
  currentTime,
  trimRange,
  muteSegments,
}: {
  file: File | null;
  trackIndex: number;
  duration: number;
  currentTime: number;
  trimRange: [number, number];
  muteSegments: Array<{ start: number; end: number }>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { data } = useAudioAnalysis(file, trackIndex);

  useEffect(() => {
    setAudioState((previous) => ({
      ...previous,
      tracks: previous.tracks.map((track) =>
        track.trackIndex === trackIndex
          ? { ...track, waveform: null, loudness: null }
          : track,
      ),
    }));
  }, [file, trackIndex]);

  useEffect(() => {
    if (!data || !file) return;
    setAudioState((previous) => ({
      ...previous,
      tracks: previous.tracks.map((track) =>
        track.trackIndex === trackIndex
          ? {
              ...track,
              waveform: {
                duration: data.duration,
                sampleRate: data.sampleRate,
                peaks: data.peaks,
                rms: data.rms,
              },
              loudness: data.loudness,
            }
          : track,
      ),
    }));
  }, [data, file, trackIndex]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data || duration <= 0) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    const width = rect.width;
    const height = rect.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "rgba(20, 184, 166, 0.72)";
    const step = width / data.peaks.length;
    data.peaks.forEach((peak, index) => {
      const x = index * step;
      const bar = Math.max(1, peak * height * 0.9);
      ctx.fillRect(x, (height - bar) / 2, Math.max(1, step), bar);
    });
    ctx.fillStyle = "rgba(0, 0, 0, 0.32)";
    ctx.fillRect(0, 0, (trimRange[0] / duration) * width, height);
    ctx.fillRect((trimRange[1] / duration) * width, 0, width, height);
    ctx.fillStyle = "rgba(239, 68, 68, 0.42)";
    for (const segment of muteSegments) {
      ctx.fillRect(
        (segment.start / duration) * width,
        0,
        ((segment.end - segment.start) / duration) * width,
        height,
      );
    }
    ctx.fillStyle = "hsl(var(--kumo-brand))";
    ctx.fillRect((currentTime / duration) * width - 1, 0, 2, height);
  }, [data, duration, currentTime, trimRange, muteSegments]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-x-0 top-0 h-10 w-full opacity-90"
      aria-label={`Audio waveform track ${trackIndex + 1}`}
    />
  );
}
