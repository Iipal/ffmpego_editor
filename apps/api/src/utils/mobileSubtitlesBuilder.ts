import path from "node:path";

export interface MobileLayoutForSubtitles {
  mode: "full" | "stacked";
  splitRatio: number;
  zones: Array<{
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    zoom: number;
  }>;
}

export interface SubtitleOverlay {
  startTime: number;
  endTime: number;
  x: number; // 0-100 percent centered
  y: number; // 0-100 percent centered
  width: number; // png pixel width (for debug, not used in expression)
  height: number;
  pngPath: string; // temp file path on server
}

export interface MobileSubtitlesOptions {
  inputPath: string;
  subtitleOverlays: SubtitleOverlay[];
  subtitlePngPaths: string[]; // parallel to overlays, paths
  sourceWidth: number;
  sourceHeight: number;
  trimRange: [number, number];
  mobileLayout: MobileLayoutForSubtitles;
  format?: "mp4" | "webm" | "mov";
  fps?: number;
  crf?: number;
  customArgs?: string;
  outputPath?: string;
  filename: string;
  speed?: number;
}

export const OUTPUT_W = 1080;
export const OUTPUT_H = 1920;
export const OUTPUT_DIRECTORY = ".";

function buildFormatArgs(format: "mp4" | "webm" | "mov", crf?: number) {
  const normalizedCrf =
    typeof crf === "number" && Number.isFinite(crf)
      ? Math.max(0, Math.min(60, crf))
      : 23;
  switch (format) {
    case "webm":
      return ["-c:v", "libvpx-vp9", "-crf", String(normalizedCrf), "-b:v", "0", "-an"];
    case "mov":
      return [
        "-c:v",
        "prores_ks",
        "-profile:v",
        "4",
        "-vendor",
        "apl0",
        "-pix_fmt",
        "yuv444p16le",
        "-color_range",
        "pc",
        "-color_primaries",
        "bt709",
        "-color_trc",
        "bt709",
        "-colorspace",
        "bt709",
      ];
    case "mp4":
    default:
      return [
        "-c:v",
        "libx264",
        "-crf",
        String(normalizedCrf),
        "-preset",
        "fast",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
      ];
  }
}

/**
 * Build FFmpeg args for 9:16 mobile + subtitle PNG overlays.
 * Front-end renders each subtitle text to a fitted PNG (with outline/shadow/background baked).
 * Backend overlays PNGs at timed intervals on top of the 1080x1920 composite.
 *
 * Each subtitle's position x/y are 0-100 percent of the 1080x1920 canvas (center point).
 * We use overlay expressions: x='W*0.5-w/2' style -> centered at percent.
 * enable='between(t,scaledStart,scaledEnd)' where scaled times are adjusted for trim + speed.
 */
export function buildMobileSubtitlesArgs(options: MobileSubtitlesOptions): string[] {
  const format = options.format ?? "mp4";
  const trimStart = options.trimRange[0];
  const trimEnd = options.trimRange[1];
  const speed = options.speed ?? 1;
  const hasSpeed = speed !== 1 && Number.isFinite(speed) && speed > 0;
  const setpts = hasSpeed ? `,setpts=${(1 / speed).toFixed(6)}*PTS` : "";

  const toCrop = (z: { x: number; y: number; width: number; height: number; zoom: number }) => {
    const cw = Math.max(1, Math.min(options.sourceWidth, Math.round((z.width / 100) * options.sourceWidth)));
    const ch = Math.max(1, Math.min(options.sourceHeight, Math.round((z.height / 100) * options.sourceHeight)));
    const cx = Math.max(0, Math.min(options.sourceWidth - cw, Math.round((z.x / 100) * options.sourceWidth)));
    const cy = Math.max(0, Math.min(options.sourceHeight - ch, Math.round((z.y / 100) * options.sourceHeight)));
    return { cw, ch, cx, cy };
  };

  // Base args: trim + video input + png loop inputs
  const args: string[] = ["-y", "-ss", String(trimStart), "-to", String(trimEnd), "-i", options.inputPath];

  for (const p of options.subtitlePngPaths) {
    args.push("-loop", "1", "-i", p);
  }

  // format args
  args.push(...buildFormatArgs(format, options.crf));

  // Build video filter_complex for mobile composite -> [v]
  let baseFilter = "";
  const ml = options.mobileLayout;
  if (ml.mode === "full" && ml.zones[0]) {
    const c = toCrop(ml.zones[0] as never);
    baseFilter = `[0:v]crop=${c.cw}:${c.ch}:${c.cx}:${c.cy},scale=${OUTPUT_W}:${OUTPUT_H}:flags=lanczos${setpts}[v]`;
  } else if (ml.mode === "stacked" && ml.zones.length >= 2) {
    const a = toCrop(ml.zones[0] as never);
    const b = toCrop(ml.zones[1] as never);
    const split = Math.max(0.2, Math.min(0.8, ml.splitRatio ?? 0.5));
    const h1 = Math.round(OUTPUT_H * split);
    const h2 = OUTPUT_H - h1;
    baseFilter = `[0:v]crop=${a.cw}:${a.ch}:${a.cx}:${a.cy},scale=${OUTPUT_W}:${h1}:flags=lanczos${setpts}[z1];[0:v]crop=${b.cw}:${b.ch}:${b.cx}:${b.cy},scale=${OUTPUT_W}:${h2}:flags=lanczos${setpts}[z2];[z1][z2]vstack=inputs=2[v]`;
  } else {
    // fallback: scale to 1080x1920
    baseFilter = `[0:v]scale=${OUTPUT_W}:${OUTPUT_H}:flags=lanczos${setpts}[v]`;
  }

  const N = options.subtitleOverlays.length;

  // No subtitles: just render mobile composite
  if (N === 0) {
    const filterComplex = baseFilter;
    if (hasSpeed) {
      const atempo = speed;
      let afilter = "";
      if (atempo > 0 && atempo < 0.5) {
        const factors: string[] = [];
        let remaining = atempo;
        while (remaining < 0.5) {
          factors.push("atempo=0.5");
          remaining *= 2;
        }
        factors.push(`atempo=${remaining.toFixed(6)}`);
        afilter = factors.join(",");
      } else {
        afilter = `atempo=${atempo.toFixed(6)}`;
      }
      args.push("-filter_complex", filterComplex, "-map", "[v]", "-map", "0:a", "-filter:a", afilter);
    } else {
      args.push("-filter_complex", filterComplex, "-map", "[v]", "-map", "0:a?");
    }
  } else {
    // Build overlay chain
    // Each subtitle input index is 1..N (0 is video)
    let filterComplex = baseFilter + ";";
    for (let i = 0; i < N; i++) {
      const ov = options.subtitleOverlays[i];
      const prevLabel = i === 0 ? "[v]" : `[tmp${i - 1}]`;
      const nextLabel = i === N - 1 ? "[vout]" : `[tmp${i}]`;
      const inputLabel = `[${i + 1}:v]`;
      // Scale subtitle timings for trim + speed
      // Clamp relative to trim, then divide by speed so enable aligns with setpts timeline
      let scaledStart = (ov.startTime - trimStart) / (hasSpeed ? speed : 1);
      let scaledEnd = (ov.endTime - trimStart) / (hasSpeed ? speed : 1);
      // Safety clamp
      scaledStart = Math.max(0, scaledStart);
      scaledEnd = Math.max(scaledStart + 0.01, scaledEnd);
      const xp = Math.max(0, Math.min(100, ov.x)) / 100;
      const yp = Math.max(0, Math.min(100, ov.y)) / 100;
      // overlay expressions: x = W * xp - w/2, y = H * yp - h/2
      // Use single quotes to protect commas; need to escape enable single quotes
      const xExpr = `W*${xp.toFixed(6)}-w/2`;
      const yExpr = `H*${yp.toFixed(6)}-h/2`;
      const enable = `between(t,${scaledStart.toFixed(6)},${scaledEnd.toFixed(6)})`;
      filterComplex += `${prevLabel}${inputLabel}overlay=x='${xExpr}':y='${yExpr}':enable='${enable}':format=auto${nextLabel}`;
      if (i < N - 1) filterComplex += ";";
    }

    if (hasSpeed) {
      const atempo = speed;
      let afilter = "";
      if (atempo > 0 && atempo < 0.5) {
        const factors: string[] = [];
        let remaining = atempo;
        while (remaining < 0.5) {
          factors.push("atempo=0.5");
          remaining *= 2;
        }
        factors.push(`atempo=${remaining.toFixed(6)}`);
        afilter = factors.join(",");
      } else {
        afilter = `atempo=${atempo.toFixed(6)}`;
      }
      args.push("-filter_complex", filterComplex, "-map", "[vout]", "-map", "0:a", "-filter:a", afilter);
    } else {
      args.push("-filter_complex", filterComplex, "-map", "[vout]", "-map", "0:a?");
    }
  }

  if (options.fps) args.push("-r", String(options.fps));

  if (options.customArgs) {
    const sanitized = options.customArgs.trim().split(/\s+/).filter(Boolean);
    if (sanitized.length) args.push(...sanitized);
  }

  // Ensure output stops at shortest (video) when png loops infinitely
  if (N > 0) args.push("-shortest");

  const outputName = options.outputPath ?? path.join(OUTPUT_DIRECTORY, `${options.filename}.${format}`);
  args.push("-progress", "pipe:2", "-nostats", outputName);

  return args;
}
