import {
  buildAtempoFilter,
  buildSetptsFilter,
  zoneToPixels,
} from "@repo/ffmpeg-filters";
import { resolveWatermarkPath } from "./ffmpegBuilder.js";

export type CutMode = "full-size" | "2-stack" | "1-stack";

export interface CutSegment {
  start: number;
  end: number;
}

export interface CutZone {
  id: string;
  x: number; // 0-1 normalized (frontend) — also accepts 0-100 percent
  y: number;
  width: number;
  height: number;
  zoom: number;
}

export interface CutTranscodeOptions {
  inputPath: string;
  filename: string;
  sourceWidth: number;
  sourceHeight: number;
  cuts: CutSegment[];
  mode: CutMode;
  /** Normalized 0-1 zones. 2 zones required for 2-stack, 1 zone for 1-stack. */
  zones?: CutZone[] | null;
  /** Required for 2-stack (0.2-0.8). Ignored otherwise. */
  splitRatio?: number;
  format?: "mp4";
  fps?: number;
  crf?: number;
  speed?: number;
  /** Pre-parsed extra flags (see parseCustomArgs in validation.ts). */
  customArgs?: string[];
  outputPath?: string;
  watermark?: boolean;
  audioTrackIndex?: number;
  audioTracks?: Array<{
    trackIndex: number;
    enabled: boolean;
    gainDb: number;
    loudnormEnabled: boolean;
    loudnormTargetLufs: number;
    fadeInSeconds: number;
    fadeOutSeconds: number;
    muteSegments: Array<{ start: number; end: number }>;
  }>;
}

function toPixels(
  z: CutZone,
  sourceWidth: number,
  sourceHeight: number,
): { cw: number; ch: number; cx: number; cy: number } {
  // Accept either 0-1 normalized or 0-100 percent (mobile endpoint multiplies by 100 before builder).
  const normalized = !(z.width > 1 || z.height > 1 || z.x > 1 || z.y > 1);
  return zoneToPixels(z, sourceWidth, sourceHeight, normalized);
}

function fmt(n: number): string {
  return Number.isFinite(n) ? String(Math.max(0, n)) : "0";
}

/**
 * Build FFmpeg args that trim N segments, optionally apply the mobile
 * stacked / single-zone 9:16 crop+scale per segment, concatenate them
 * in order, and optionally overlay the watermark.
 */
export function buildCutFFmpegArgs(options: CutTranscodeOptions): string[] {
  const cuts = [...options.cuts].sort((a, b) => a.start - b.start);
  const format = options.format ?? "mp4";
  const outputName = options.outputPath ?? `${options.filename}.${format}`;

  const watermarkEnabled =
    !!options.watermark &&
    (options.mode === "2-stack" || options.mode === "1-stack");
  let watermarkPath: string | null = null;
  if (watermarkEnabled) {
    watermarkPath = resolveWatermarkPath();
  }

  const args: string[] = ["-y", "-i", options.inputPath];
  if (watermarkEnabled && watermarkPath) {
    args.push("-loop", "1", "-framerate", "60", "-i", watermarkPath);
  }
  // Encoder — same baseline as mobile exports (mp4 CRF default 10-ish, caller picks).
  const crf =
    typeof options.crf === "number" && Number.isFinite(options.crf)
      ? Math.max(0, Math.min(51, Math.round(options.crf)))
      : 10;
  args.push(
    "-c:v",
    "libx264",
    "-crf",
    String(crf),
    "-preset",
    "fast",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
  );

  const hasSpeed = options.speed !== undefined && options.speed !== 1;
  const speed = hasSpeed ? (options.speed as number) : 1;
  const atempo = hasSpeed
    ? (() => {
        if (speed > 0 && speed < 0.5) {
          return buildAtempoFilter(speed);
        }
        return `atempo=${speed.toFixed(6)}`;
      })()
    : null;
  const vSpeed = hasSpeed ? `,${buildSetptsFilter(speed)}` : "";
  const enabledAudioTracks =
    options.audioTracks?.filter((track) => track.enabled) ?? [];
  const tracksForRender = options.audioTracks
    ? enabledAudioTracks
    : [
        {
          trackIndex: options.audioTrackIndex ?? 0,
          enabled: true,
          gainDb: 0,
          loudnormEnabled: false,
          loudnormTargetLufs: -14,
          fadeInSeconds: 0,
          fadeOutSeconds: 0,
          muteSegments: [],
        },
      ];
  const audioLabelsForCut = (cut: CutSegment, cutIndex: number) =>
    tracksForRender.map((track, trackIndex) => {
      const source =
        options.audioTracks === undefined &&
        options.audioTrackIndex === undefined
          ? "[0:a]"
          : `[0:a:${track.trackIndex}]`;
      const filters = [
        `atrim=${fmt(cut.start)}:${fmt(cut.end)}`,
        "asetpts=PTS-STARTPTS",
      ];
      if (atempo) filters.push(atempo);
      if (track.gainDb) filters.push(`volume=${track.gainDb.toFixed(3)}dB`);
      if (track.loudnormEnabled)
        filters.push(
          `loudnorm=I=${track.loudnormTargetLufs}:print_format=summary`,
        );
      if (track.fadeInSeconds > 0)
        filters.push(`afade=t=in:st=0:d=${track.fadeInSeconds}`);
      if (track.fadeOutSeconds > 0)
        filters.push(
          `afade=t=out:st=${Math.max(0, cut.end - cut.start - track.fadeOutSeconds)}:d=${track.fadeOutSeconds}`,
        );
      for (const segment of track.muteSegments)
        if (segment.end > segment.start)
          filters.push(
            `volume=0:enable='between(t,${segment.start},${segment.end})'`,
          );
      return {
        label: `[a${trackIndex}_${cutIndex}]`,
        filter: `${source}${filters.join(",")}${`[a${trackIndex}_${cutIndex}]`}`,
      };
    });
  const audioCount = tracksForRender.length;

  const chains: string[] = [];
  const concatInputs: string[] = [];

  if (options.mode === "full-size") {
    cuts.forEach((cut, i) => {
      chains.push(
        `[0:v]trim=${fmt(cut.start)}:${fmt(cut.end)},setpts=PTS-STARTPTS${vSpeed}[v${i}]`,
      );
      const audio = audioLabelsForCut(cut, i);
      chains.push(...audio.map((item) => item.filter));
      concatInputs.push(`[v${i}]${audio.map((item) => item.label).join("")}`);
    });
    chains.push(
      `${concatInputs.join("")}concat=n=${cuts.length}:v=1:a=${audioCount}[vcat]${Array.from({ length: audioCount }, (_, index) => `[acat${index}]`).join("")}`,
    );
  } else if (options.mode === "1-stack") {
    const z = (options.zones as CutZone[])[0];
    const c = toPixels(z, options.sourceWidth, options.sourceHeight);
    cuts.forEach((cut, i) => {
      chains.push(
        `[0:v]trim=${fmt(cut.start)}:${fmt(cut.end)},setpts=PTS-STARTPTS,crop=${c.cw}:${c.ch}:${c.cx}:${c.cy},scale=1080:1920:flags=lanczos${vSpeed}[v${i}]`,
      );
      const audio = audioLabelsForCut(cut, i);
      chains.push(...audio.map((item) => item.filter));
      concatInputs.push(`[v${i}]${audio.map((item) => item.label).join("")}`);
    });
    chains.push(
      `${concatInputs.join("")}concat=n=${cuts.length}:v=1:a=${audioCount}[vcat]${Array.from({ length: audioCount }, (_, index) => `[acat${index}]`).join("")}`,
    );
  } else {
    // 2-stack: per cut, trim twice (top/bottom), crop+scale each half, vstack.
    const split = Math.max(0.2, Math.min(0.8, options.splitRatio ?? 0.5));
    const h1 = Math.round(1920 * split);
    const h2 = 1920 - h1;
    const zones = options.zones as CutZone[];
    const a = toPixels(zones[0], options.sourceWidth, options.sourceHeight);
    const b = toPixels(zones[1], options.sourceWidth, options.sourceHeight);
    cuts.forEach((cut, i) => {
      chains.push(
        `[0:v]trim=${fmt(cut.start)}:${fmt(cut.end)},setpts=PTS-STARTPTS,crop=${a.cw}:${a.ch}:${a.cx}:${a.cy},scale=1080:${h1}:flags=lanczos${vSpeed}[v${i}t]`,
      );
      chains.push(
        `[0:v]trim=${fmt(cut.start)}:${fmt(cut.end)},setpts=PTS-STARTPTS,crop=${b.cw}:${b.ch}:${b.cx}:${b.cy},scale=1080:${h2}:flags=lanczos${vSpeed}[v${i}b]`,
      );
      chains.push(`[v${i}t][v${i}b]vstack=inputs=2[v${i}]`);
      const audio = audioLabelsForCut(cut, i);
      chains.push(...audio.map((item) => item.filter));
      concatInputs.push(`[v${i}]${audio.map((item) => item.label).join("")}`);
    });
    chains.push(
      `${concatInputs.join("")}concat=n=${cuts.length}:v=1:a=${audioCount}[vcat]${Array.from({ length: audioCount }, (_, index) => `[acat${index}]`).join("")}`,
    );
  }

  if (watermarkEnabled) {
    // Overlay full-canvas watermark PNG on top of concatenated video.
    chains.push(`[vcat][1:v]overlay=0:0:format=auto:shortest=1[v]`);
    args.push("-filter_complex", chains.join(";"));
    args.push("-map", "[v]");
    for (let index = 0; index < audioCount; index++)
      args.push("-map", `[acat${index}]`);
  } else {
    args.push("-filter_complex", chains.join(";"));
    args.push("-map", "[vcat]");
    for (let index = 0; index < audioCount; index++)
      args.push("-map", `[acat${index}]`);
  }

  if (options.fps) args.push("-r", String(options.fps));

  // Pre-parsed via parseCustomArgs (shell-quote + structural denylist).
  // NOTE: no -an strip here anymore — routes sanitize; -vf is denied at parse.
  if (options.customArgs?.length) args.push(...options.customArgs);

  args.push("-progress", "pipe:2", "-nostats", outputName);
  return args;
}

export function totalCutDuration(cuts: CutSegment[]): number {
  return cuts.reduce((acc, c) => acc + Math.max(0, c.end - c.start), 0);
}
