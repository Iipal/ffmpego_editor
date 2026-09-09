import fs from "node:fs";
import path from "node:path";
import {
  buildAtempoFilter,
  buildSetptsFilter,
  buildVisualVideoFilters,
  cropPercentToPixels,
  isVisualFiltersDefault,
  normalizeVisualFilters,
  type VisualFilters,
} from "@repo/ffmpeg-filters";

// server-hoist-static-io: candidate list is static — build once, cache resolved path
const WATERMARK_CANDIDATES = [
  path.join(import.meta.dir, "../assets/minozavr.png"),
  path.resolve("apps/api/assets/minozavr.png"),
  path.resolve("assets/minozavr.png"),
  path.join(process.cwd(), "apps/api/assets/minozavr.png"),
  path.join(process.cwd(), "assets/minozavr.png"),
];
let cachedWatermarkPath: string | null | undefined;

function resolveWatermarkPath(): string {
  if (cachedWatermarkPath !== undefined) return cachedWatermarkPath as string;
  for (const c of WATERMARK_CANDIDATES) {
    try {
      if (fs.existsSync(c)) {
        cachedWatermarkPath = c;
        return c;
      }
    } catch {}
  }
  cachedWatermarkPath = WATERMARK_CANDIDATES[0];
  return cachedWatermarkPath;
}

/**
 * Input options used to build a full FFmpeg command line.
 *
 * Most values are derived from the UI state, including crop dimensions
 * expressed as a percentage of the source video dimensions.
 */
export interface MobileLayoutForFFmpeg {
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

export interface TranscodeOptions {
  inputPath: string;
  filename: string;
  sourceWidth: number;
  sourceHeight: number;
  trimRange: [number, number];
  ignoreTrim?: boolean;
  crop: { x: number; y: number; width: number; height: number };
  format: "mp4" | "webm" | "mov" | "webm-tg" | "gif";
  outputSuffix?: string;
  speed?: number;
  fps?: number;
  crf?: number;
  /** Pre-parsed extra flags (see parseCustomArgs in validation.ts). */
  customArgs?: string[];
  /** Structured visual filter stack (Sidebar UI). Built via shared builder. */
  visualFilters?: VisualFilters;
  /** -vf values merged into the builder's own video filter chain. */
  extraVideoFilters?: string[];
  outputPath?: string;
  mobileLayout?: MobileLayoutForFFmpeg | null;
  watermark?: boolean;
  gainDb?: number;
  loudnormTargetLufs?: number;
  fadeInSeconds?: number;
  fadeOutSeconds?: number;
  muteSegments?: Array<{ start: number; end: number }>;
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

function buildAudioFilter(
  options: TranscodeOptions,
  speed?: number,
  track?: NonNullable<TranscodeOptions["audioTracks"]>[number],
) {
  const filters: string[] = [];
  const rate = speed ?? options.speed;
  if (rate !== undefined && rate !== 1) {
    filters.push(
      rate > 0 && rate < 0.5
        ? buildAtempoFilter(rate)
        : `atempo=${rate.toFixed(6)}`,
    );
  }
  const settings = track ?? {
    gainDb: options.gainDb ?? 0,
    loudnormEnabled: options.loudnormTargetLufs !== undefined,
    loudnormTargetLufs: options.loudnormTargetLufs ?? -14,
    fadeInSeconds: options.fadeInSeconds ?? 0,
    fadeOutSeconds: options.fadeOutSeconds ?? 0,
    muteSegments: options.muteSegments ?? [],
  };
  if (settings.gainDb) filters.push(`volume=${settings.gainDb.toFixed(3)}dB`);
  if (settings.loudnormEnabled)
    filters.push(
      `loudnorm=I=${settings.loudnormTargetLufs}:print_format=summary`,
    );
  if (settings.fadeInSeconds > 0)
    filters.push(`afade=t=in:st=0:d=${settings.fadeInSeconds}`);
  if (settings.fadeOutSeconds > 0) {
    const end = Math.max(
      0,
      options.trimRange[1] - options.trimRange[0] - settings.fadeOutSeconds,
    );
    filters.push(`afade=t=out:st=${end}:d=${settings.fadeOutSeconds}`);
  }
  for (const segment of settings.muteSegments) {
    if (segment.end > segment.start)
      filters.push(
        `volume=0:enable='between(t,${segment.start},${segment.end})'`,
      );
  }
  return filters.length ? filters.join(",") : null;
}

/**
 * Fallback output directory when no explicit outputPath is provided.
 * All callers pass an absolute os.tmpdir() path; files are kept until the
 * user deletes the job (no auto-delete on download).
 */
export const OUTPUT_DIRECTORY = ".";

/**
 * Build encoder-specific FFmpeg args for the selected format.
 *
 * B4: webm no longer silently forces fps=30, scale=512:-1 and -an. It now
 * respects the requested fps (via -r), keeps full resolution, and encodes
 * audio as Opus (dropped automatically when the input has no audio track).
 * The CRF value can be overridden from the frontend.
 *
 * The returned args are inserted after the input arguments and before any
 * filter or output path arguments.
 */
function buildFormatArgs(
  format: TranscodeOptions["format"],
  crf: number | undefined,
) {
  const normalizedCrf =
    typeof crf === "number" && Number.isFinite(crf)
      ? Math.max(0, Math.min(60, crf))
      : 23;

  switch (format) {
    case "webm":
      return [
        "-c:v",
        "libvpx-vp9",
        "-crf",
        String(normalizedCrf),
        "-b:v",
        "0",
        "-c:a",
        "libopus",
      ].flat();
    case "gif":
      // Silent preview GIF: callers cap size via scale + fps via -r.
      return ["-c:v", "gif", "-an"].flat();
    case "mov":      return [
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
      ].flat();
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
      ].flat();
  }
}

/**
 * Strict Telegram sticker preset ("webm-tg").
 *
 * Renders exactly:
 *   ffmpeg -y -i <input> -t 3 -vf 'fps=30,scale=512:-1' \
 *     -c:v libvpx-vp9 -crf <crf> -b:v 0 -an <output>
 *
 * All other options (speed, fps, audio, watermark,
 * mobileLayout, custom args) are intentionally ignored on this path.
 */
export const TELEGRAM_WEBM_TG_DURATION = 3;
const TELEGRAM_WEBM_TG_FILTER = "fps=30,scale=512:-1";

/** Hard size cap for the webm-tg preset (bytes). */
export const TELEGRAM_WEBM_TG_TARGET_BYTES = 256_000;
/** CRF step for the iterative size search (faster than step 1). */
export const TELEGRAM_WEBM_TG_CRF_STEP = 2;
/** VP9 CRF bounds. */
export const TELEGRAM_WEBM_TG_CRF_MIN = 0;
export const TELEGRAM_WEBM_TG_CRF_MAX = 63;

/** Normalize a requested CRF to the VP9 range (default 10 like the builder). */
export function clampTelegramCrf(crf: unknown): number {
  if (typeof crf !== "number" || !Number.isFinite(crf))
    return 10;
  return Math.max(
    TELEGRAM_WEBM_TG_CRF_MIN,
    Math.min(TELEGRAM_WEBM_TG_CRF_MAX, Math.round(crf)),
  );
}

/**
 * Output duration for the webm-tg preset: the trim length capped at 3s,
 * or a flat 3s when trim is ignored or invalid.
 */
export function telegramWebmTgDuration(
  trimRange: [number, number],
  ignoreTrim?: boolean,
): number {
  if (!ignoreTrim) {
    const d = trimRange[1] - trimRange[0];
    if (Number.isFinite(d) && d > 0)
      return Math.min(TELEGRAM_WEBM_TG_DURATION, d);
  }
  return TELEGRAM_WEBM_TG_DURATION;
}

function buildTelegramWebmTgArgs(
  options: TranscodeOptions,
  outputPath: string,
) {
  const normalizedCrf = clampTelegramCrf(options.crf);
  const args: string[] = ["-y"];
  if (!options.ignoreTrim) {
    const start = options.trimRange[0];
    const dur = options.trimRange[1] - options.trimRange[0];
    if (
      Number.isFinite(start) &&
      start > 0 &&
      Number.isFinite(dur) &&
      dur > 0
    ) {
      args.push("-ss", String(start));
    }
  }
  const crop = cropPercentToPixels(
    options.crop,
    options.sourceWidth,
    options.sourceHeight,
  );
  let vf = TELEGRAM_WEBM_TG_FILTER;
  if (
    crop.cw !== options.sourceWidth ||
    crop.ch !== options.sourceHeight
  ) {
    vf = `crop=${crop.cw}:${crop.ch}:${crop.cx}:${crop.cy},${vf}`;
  }
  args.push(
    "-i",
    options.inputPath,
    "-t",
    String(telegramWebmTgDuration(options.trimRange, options.ignoreTrim)),
    "-vf",
    vf,
    "-c:v",
    "libvpx-vp9",
    "-crf",
    String(normalizedCrf),
    "-b:v",
    "0",
    "-an",
    "-progress",
    "pipe:2",
    "-nostats",
    outputPath,
  );
  return args;
}

/**
 * Build the complete FFmpeg command line for a single export job.
 *
 * This includes trimming, cropping, speed adjustments, optional FPS changes,
 * and any additional user-supplied FFmpeg flags.
 */
export function buildFFmpegArgs(options: TranscodeOptions) {
  // Telegram sticker preset: fixed encoder settings, but honors trim
  // (seek + duration capped at 3s) and crop. Everything else (speed, fps,
  // audio, watermark, mobileLayout, custom args) is ignored on this path.
  if (options.format === "webm-tg") {
    const outputName =
      options.outputPath ??
      `${options.filename}${options.outputSuffix ?? ""}.webm`;
    const finalOutputPath =
      options.outputPath ?? path.join(OUTPUT_DIRECTORY, outputName);
    return buildTelegramWebmTgArgs(options, finalOutputPath);
  }
  // Convert crop rectangle percentages to absolute pixel values.
  // Values are clamped to the source dimensions so FFmpeg never receives
  // invalid crop coordinates.
  const crop = cropPercentToPixels(
    options.crop,
    options.sourceWidth,
    options.sourceHeight,
  );
  const { cw: cropWidth, ch: cropHeight, cx: cropX, cy: cropY } = crop;

  // Crop top-left coordinates are also scaled from percentage to pixels and
  // clamped to ensure the crop window stays fully inside the source frame.
  const outputName =
    options.outputPath ??
    `${options.filename}${options.outputSuffix ?? ""}.${options.format}`;

  // GIF previews are silent and small: drop the mobile-layout graph (which
  // targets 1080x1920 + audio) and skip every audio map/filter (-an is set
  // in buildFormatArgs; audio filters with no audio streams would fail).
  const isGif = options.format === "gif";
  if (isGif) options = { ...options, mobileLayout: null };
  const noAudio = isGif;
  const watermarkEnabled = !!options.watermark && !!options.mobileLayout;
  let watermarkPath: string | null = null;
  if (watermarkEnabled) {
    watermarkPath = resolveWatermarkPath();
  }

  const args: string[] = ["-y"];
  if (!options.ignoreTrim) {
    args.push(
      "-ss",
      String(options.trimRange[0]),
      "-to",
      String(options.trimRange[1]),
    );
  }
  args.push("-i", options.inputPath);
  if (watermarkEnabled && watermarkPath) {
    args.push("-loop", "1", "-framerate", "30", "-i", watermarkPath);
  }
  args.push(...buildFormatArgs(options.format, options.crf));
  const enabledAudioTracks =
    options.audioTracks?.filter((track) => track.enabled) ?? [];
  const audioMap =
    options.audioTrackIndex !== undefined
      ? `0:a:${options.audioTrackIndex}?`
      : "0:a?";
  if (!noAudio && !options.mobileLayout && options.audioTracks) {
    args.push("-map", "0:v?");
    for (const track of enabledAudioTracks)
      args.push("-map", `0:a:${track.trackIndex}?`);
  } else if (!noAudio && !options.mobileLayout && options.audioTrackIndex !== undefined) {
    args.push("-map", "0:v?", "-map", audioMap);
  }

  const videoFilters: string[] = [];

  // Only add a crop filter when the requested crop differs from the full frame.
  if (
    cropWidth !== options.sourceWidth ||
    cropHeight !== options.sourceHeight
  ) {
    videoFilters.push(`crop=${cropWidth}:${cropHeight}:${cropX}:${cropY}`);
  }

  // GIF previews stay small: cap width at 480px (-2 keeps aspect + even dims).
  if (isGif) videoFilters.push("scale=480:-2:flags=lanczos");

  // (B4: webm no longer forces fps=30/scale=512 here — fps comes from -r,
  // resolution and audio are preserved like every other format.)

  // Mobile layout takes precedence - it builds its own filter_complex with speed handled inside
  // usedComplex tracks -filter_complex usage: user -vf cannot merge into a
  // labeled complex graph, so routes deny -vf there (defense in depth: throw).
  let usedComplex = false;
  if (options.mobileLayout) {
    const ml = options.mobileLayout;
    const toCrop = (z: {
      x: number;
      y: number;
      width: number;
      height: number;
      zoom: number;
    }) => {
      const cw = Math.max(
        1,
        Math.min(
          options.sourceWidth,
          Math.round((z.width / 100) * options.sourceWidth),
        ),
      );
      const ch = Math.max(
        1,
        Math.min(
          options.sourceHeight,
          Math.round((z.height / 100) * options.sourceHeight),
        ),
      );
      const cx = Math.max(
        0,
        Math.min(
          options.sourceWidth - cw,
          Math.round((z.x / 100) * options.sourceWidth),
        ),
      );
      const cy = Math.max(
        0,
        Math.min(
          options.sourceHeight - ch,
          Math.round((z.y / 100) * options.sourceHeight),
        ),
      );
      return { cw, ch, cx, cy };
    };
    const hasSpeed = options.speed !== undefined && options.speed !== 1;
    const setpts = hasSpeed
      ? `,${buildSetptsFilter(options.speed as number)}`
      : "";
    const wm = watermarkEnabled;
    const getAudio = (): string | null =>
      buildAudioFilter(options, undefined, enabledAudioTracks[0]);
    const audioArgs = (fallback: string | null) => {
      if (options.audioTracks) {
        return enabledAudioTracks.flatMap((track, index) => {
          const filter = buildAudioFilter(options, undefined, track);
          return [
            "-map",
            `0:a:${track.trackIndex}?`,
            ...(filter ? [`-filter:a:${index}`, filter] : []),
          ];
        });
      }
      return ["-map", audioMap, ...(fallback ? ["-filter:a", fallback] : [])];
    };
    if (ml.mode === "full" && ml.zones[0]) {
      const c = toCrop(ml.zones[0] as never);
      if (wm) {
        // use filter_complex for watermark overlay on top of cropped/scaled video
        const base = `[0:v]crop=${c.cw}:${c.ch}:${c.cx}:${c.cy},scale=1080:1920:flags=lanczos${setpts}[vbase]`;
        const filterComplex = `${base};[vbase][1:v]overlay=0:0:format=auto:shortest=1[v]`;
        const af = getAudio();
        if (af)
          args.push(
            "-filter_complex",
            filterComplex,
            "-map",
            "[v]",
            ...audioArgs(af),
          );
        else
          args.push(
            "-filter_complex",
            filterComplex,
            "-map",
            "[v]",
            ...audioArgs(null),
          );
        usedComplex = true;
        videoFilters.length = 0;
      } else {
        videoFilters.length = 0;
        videoFilters.push(
          `crop=${c.cw}:${c.ch}:${c.cx}:${c.cy}`,
          `scale=1080:1920:flags=lanczos${setpts}`,
        );
        const af = getAudio();
        if (options.audioTracks) args.push(...audioArgs(af));
        else if (af) args.push("-filter:a", af);
      }
    } else if (ml.mode === "stacked" && ml.zones.length >= 2) {
      const a = toCrop(ml.zones[0] as never);
      const b = toCrop(ml.zones[1] as never);
      const split = Math.max(0.2, Math.min(0.8, ml.splitRatio ?? 0.5));
      const h1 = Math.round(1920 * split);
      const h2 = 1920 - h1;
      const baseComplex = `[0:v]crop=${a.cw}:${a.ch}:${a.cx}:${a.cy},scale=1080:${h1}:flags=lanczos${setpts}[z1];[0:v]crop=${b.cw}:${b.ch}:${b.cx}:${b.cy},scale=1080:${h2}:flags=lanczos${setpts}[z2];[z1][z2]vstack=inputs=2[vbase]`;
      if (wm) {
        const fullComplex = `${baseComplex};[vbase][1:v]overlay=0:0:format=auto:shortest=1[v]`;
        const af = getAudio();
        if (af)
          args.push(
            "-filter_complex",
            fullComplex,
            "-map",
            "[v]",
            ...audioArgs(af),
          );
        else
          args.push(
            "-filter_complex",
            fullComplex,
            "-map",
            "[v]",
            ...audioArgs(null),
          );
        usedComplex = true;
      } else {
        const simpleComplex = `[0:v]crop=${a.cw}:${a.ch}:${a.cx}:${a.cy},scale=1080:${h1}:flags=lanczos${setpts}[z1];[0:v]crop=${b.cw}:${b.ch}:${b.cx}:${b.cy},scale=1080:${h2}:flags=lanczos${setpts}[z2];[z1][z2]vstack=inputs=2[v]`;
        const af = getAudio();
        if (af)
          args.push(
            "-filter_complex",
            simpleComplex,
            "-map",
            "[v]",
            ...audioArgs(af),
          );
        else
          args.push(
            "-filter_complex",
            simpleComplex,
            "-map",
            "[v]",
            ...audioArgs(null),
          );
        usedComplex = true;
      }
      videoFilters.length = 0;
    }
  }

  // Non-mobile speed handling (video only for GIF — no audio streams exist).
  if (
    !options.mobileLayout &&
    !options.audioTracks &&
    options.speed &&
    options.speed !== 1
  ) {
    videoFilters.push(buildSetptsFilter(options.speed));
    if (!noAudio) {
      const audio = buildAudioFilter(options);
      if (audio) args.push("-filter:a", audio);
    }
  }

  if (
    !noAudio &&
    !options.mobileLayout &&
    !options.audioTracks &&
    (!options.speed || options.speed === 1)
  ) {
    const audio = buildAudioFilter(options);
    if (audio) args.push("-filter:a", audio);
  }

  if (!noAudio && !options.mobileLayout && options.audioTracks) {
    enabledAudioTracks.forEach((track, index) => {
      const audio = buildAudioFilter(options, options.speed, track);
      if (audio) args.push("-filter:a:" + index, audio);
    });
  }

  // Structured visual stack (Sidebar UI) — single shared builder with the
  // live preview. Order: crop → visual → speed → custom extraVf.
  // A labeled -filter_complex graph cannot take a -vf — routes deny this
  // with a 400; this throw is defense in depth for direct callers.
  const visual = options.visualFilters
    ? normalizeVisualFilters(options.visualFilters)
    : null;
  if (visual && !isVisualFiltersDefault(visual)) {
    if (usedComplex || options.mobileLayout) {
      throw new Error(
        "visualFilters cannot be combined with mobileLayout filter_complex output",
      );
    }
    videoFilters.push(...buildVisualVideoFilters(visual));
  }

  // User -vf values merge into our -vf chain (validated by parseCustomArgs).
  // A labeled -filter_complex graph cannot take a second -vf — routes already
  // deny -vf there; this throw is defense in depth for direct callers.
  if (options.extraVideoFilters?.length) {
    if (usedComplex) {
      throw new Error(
        "extraVideoFilters cannot be combined with mobileLayout filter_complex output",
      );
    }
    videoFilters.push(...options.extraVideoFilters);
  }

  if (videoFilters.length) {
    args.push("-vf", videoFilters.join(","));
  }

  if (options.fps) args.push("-r", String(options.fps));

  // Pre-parsed via parseCustomArgs (shell-quote + structural denylist).
  if (options.customArgs?.length) args.push(...options.customArgs);

  // Use the explicit outputPath if provided, otherwise fall back to OUTPUT_DIRECTORY.
  const finalOutputPath =
    options.outputPath ?? path.join(OUTPUT_DIRECTORY, outputName);

  args.push("-progress", "pipe:2", "-nostats", finalOutputPath);

  return args;
}
