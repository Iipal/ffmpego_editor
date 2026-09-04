import fs from "node:fs";
import path from "node:path";

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
  customArgs?: string;
  outputPath?: string;
  watermark?: boolean;
}

function toPixels(
  z: CutZone,
  sourceWidth: number,
  sourceHeight: number,
): { cw: number; ch: number; cx: number; cy: number } {
  // Accept either 0-1 normalized or 0-100 percent (mobile endpoint multiplies by 100 before builder).
  const scale = z.width > 1 || z.height > 1 || z.x > 1 || z.y > 1 ? 100 : 1;
  const nx = z.x / scale;
  const ny = z.y / scale;
  const nw = z.width / scale;
  const nh = z.height / scale;
  const cw = Math.max(1, Math.min(sourceWidth, Math.round(nw * sourceWidth)));
  const ch = Math.max(1, Math.min(sourceHeight, Math.round(nh * sourceHeight)));
  const cx = Math.max(
    0,
    Math.min(sourceWidth - cw, Math.round(nx * sourceWidth)),
  );
  const cy = Math.max(
    0,
    Math.min(sourceHeight - ch, Math.round(ny * sourceHeight)),
  );
  return { cw, ch, cx, cy };
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
    const candidates = [
      path.join(import.meta.dir, "../assets/minozavr.png"),
      path.resolve("apps/api/assets/minozavr.png"),
      path.resolve("assets/minozavr.png"),
      path.join(process.cwd(), "apps/api/assets/minozavr.png"),
      path.join(process.cwd(), "assets/minozavr.png"),
    ];
    for (const c of candidates) {
      try {
        if (fs.existsSync(c)) {
          watermarkPath = c;
          break;
        }
      } catch {}
    }
    if (!watermarkPath) watermarkPath = candidates[0];
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
          const factors: string[] = [];
          let remaining = speed;
          while (remaining < 0.5) {
            factors.push("atempo=0.5");
            remaining *= 2;
          }
          factors.push(`atempo=${remaining.toFixed(6)}`);
          return factors.join(",");
        }
        return `atempo=${speed.toFixed(6)}`;
      })()
    : null;
  const vSpeed = hasSpeed ? `,setpts=${(1 / speed).toFixed(6)}*PTS` : "";

  const chains: string[] = [];
  const concatInputs: string[] = [];

  if (options.mode === "full-size") {
    cuts.forEach((cut, i) => {
      chains.push(
        `[0:v]trim=${fmt(cut.start)}:${fmt(cut.end)},setpts=PTS-STARTPTS${vSpeed}[v${i}]`,
      );
      chains.push(
        `[0:a]atrim=${fmt(cut.start)}:${fmt(cut.end)},asetpts=PTS-STARTPTS[a${i}]`,
      );
      concatInputs.push(`[v${i}][a${i}]`);
    });
    chains.push(
      `${concatInputs.join("")}concat=n=${cuts.length}:v=1:a=1[vcat][acat]`,
    );
  } else if (options.mode === "1-stack") {
    const z = (options.zones as CutZone[])[0];
    const c = toPixels(z, options.sourceWidth, options.sourceHeight);
    cuts.forEach((cut, i) => {
      chains.push(
        `[0:v]trim=${fmt(cut.start)}:${fmt(cut.end)},setpts=PTS-STARTPTS,crop=${c.cw}:${c.ch}:${c.cx}:${c.cy},scale=1080:1920:flags=lanczos${vSpeed}[v${i}]`,
      );
      chains.push(
        `[0:a]atrim=${fmt(cut.start)}:${fmt(cut.end)},asetpts=PTS-STARTPTS[a${i}]`,
      );
      concatInputs.push(`[v${i}][a${i}]`);
    });
    chains.push(
      `${concatInputs.join("")}concat=n=${cuts.length}:v=1:a=1[vcat][acat]`,
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
      chains.push(
        `[0:a]atrim=${fmt(cut.start)}:${fmt(cut.end)},asetpts=PTS-STARTPTS[a${i}]`,
      );
      concatInputs.push(`[v${i}][a${i}]`);
    });
    chains.push(
      `${concatInputs.join("")}concat=n=${cuts.length}:v=1:a=1[vcat][acat]`,
    );
  }

  if (watermarkEnabled) {
    // Overlay full-canvas watermark PNG on top of concatenated video.
    chains.push(`[vcat][1:v]overlay=0:0:format=auto:shortest=1[v]`);
    args.push("-filter_complex", chains.join(";"));
    args.push("-map", "[v]", "-map", "[acat]");
    if (atempo) args.push("-filter:a", atempo);
  } else {
    args.push("-filter_complex", chains.join(";"));
    args.push("-map", "[vcat]", "-map", "[acat]");
    if (atempo) args.push("-filter:a", atempo);
  }

  if (options.fps) args.push("-r", String(options.fps));

  if (options.customArgs) {
    const extra = options.customArgs
      .replace(/(^|\s)-an(\s|$)/g, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (extra.length) args.push(...extra);
  }

  args.push("-progress", "pipe:2", "-nostats", outputName);
  return args;
}

export function totalCutDuration(cuts: CutSegment[]): number {
  return cuts.reduce((acc, c) => acc + Math.max(0, c.end - c.start), 0);
}
