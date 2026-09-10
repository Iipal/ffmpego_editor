/**
 * Pure ffprobe-report parsing for POST /metadata (B5 observability).
 *
 * Extracted from routes/metadata.ts so the video/audio stream selection and
 * frame-rate math are unit-testable against golden ffprobe JSON fixtures
 * without spawning binaries.
 */

import type { FFprobeReport } from "@repo/types";

export type { FFprobeReport } from "@repo/types";

export interface VideoMetadata {
  filename: string;
  containerFormat: string;
  durationSeconds: number;
  width: number;
  height: number;
  frameRate: number;
  videoCodec: string;
  audioCodec?: string;
  bitrateKbps: number;
  ffprobe: FFprobeReport;
}

export type MetadataResult =
  | { ok: true; metadata: VideoMetadata }
  | { ok: false; error: "no-video-stream" | "empty-report" };

/**
 * ffprobe ≥6 merges `-show_frames` + `-show_packets` into a single
 * interleaved `packets_and_frames` array (each entry tagged
 * `type: "frame"|"packet"`) instead of separate `frames`/`packets` arrays.
 * Split it back so deep-probe consumers always see `frames[]`/`packets[]`.
 */
export function splitPacketsAndFrames(result: FFprobeReport): FFprobeReport {
  const merged = result.packets_and_frames;
  if (!Array.isArray(merged) || merged.length === 0) return result;
  if (Array.isArray(result.frames) || Array.isArray(result.packets))
    return result;
  const frames = merged.filter((e) => e.type === "frame");
  const packets = merged.filter((e) => e.type === "packet");
  return { ...result, frames, packets };
}

/**
 * Pick the first video (+audio) streams out of a parsed ffprobe JSON report.
 * Returns a typed failure reason instead of throwing so routes can map
 * `no-video-stream` → 422 (valid media, wrong kind) distinctly from spawn /
 * probe failures (500 / 422-unreadable).
 */
export function extractVideoMetadata(
  result: FFprobeReport,
  filename: string,
): MetadataResult {
  const normalized = splitPacketsAndFrames(result);
  const format = normalized.format ?? {};
  const streams = normalized.streams ?? [];
  if (streams.length === 0 && Object.keys(format).length === 0) {
    return { ok: false, error: "empty-report" };
  }
  const video = streams.find((stream) => stream.codec_type === "video");
  const audio = streams.find((stream) => stream.codec_type === "audio");
  if (!video) return { ok: false, error: "no-video-stream" };
  const [numerator, denominator] = String(video.r_frame_rate ?? "0/1")
    .split("/")
    .map(Number);
  return {
    ok: true,
    metadata: {
      filename,
      containerFormat: String(format.format_name ?? ""),
      durationSeconds: Number(format.duration),
      width: Number(video.width),
      height: Number(video.height),
      frameRate: denominator ? numerator / denominator : 0,
      videoCodec: String(video.codec_name ?? ""),
      audioCodec: audio?.codec_name ? String(audio.codec_name) : undefined,
      bitrateKbps: Math.round(Number(format.bit_rate ?? 0) / 1000),
      ffprobe: normalized,
    },
  };
}
