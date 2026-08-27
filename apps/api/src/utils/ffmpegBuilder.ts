import path from "node:path";

/**
 * Input options used to build a full FFmpeg command line.
 *
 * Most values are derived from the UI state, including crop dimensions
 * expressed as a percentage of the source video dimensions.
 */
export interface TranscodeOptions {
  inputPath: string;
  filename: string;
  sourceWidth: number;
  sourceHeight: number;
  trimRange: [number, number];
  crop: { x: number; y: number; width: number; height: number };
  format: "mp4" | "webm" | "mov";
  outputSuffix?: string;
  speed?: number;
  fps?: number;
  crf?: number;
  customArgs?: string;
}

/**
 * Output directory for all exported video files.
 *
 * The project is configured to write exports to a local developer directory.
 */
export const OUTPUT_DIRECTORY = path.join("/mnt/d/", "ffmpego_edits");

/**
 * Build encoder-specific FFmpeg args for the selected format.
 *
 * For webm, a fixed command is used: fps=30, scale=512:-1, VP9 code. The CRF value can be overridden from the frontend.
 * Audio is disabled (-an) and no custom args are accepted for this format.
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
        "-an",
      ].flat();
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
 * Build the complete FFmpeg command line for a single export job.
 *
 * This includes trimming, cropping, speed adjustments, optional FPS changes,
 * and any additional user-supplied FFmpeg flags.
 */
export function buildFFmpegArgs(options: TranscodeOptions) {
  // Convert crop rectangle percentages to absolute pixel values.
  // Values are clamped to the source dimensions so FFmpeg never receives
  // invalid crop coordinates.
  const cropWidth = Math.max(
    1,
    Math.min(
      options.sourceWidth,
      Math.round((options.crop.width / 100) * options.sourceWidth),
    ),
  );
  const cropHeight = Math.max(
    1,
    Math.min(
      options.sourceHeight,
      Math.round((options.crop.height / 100) * options.sourceHeight),
    ),
  );

  // Crop top-left coordinates are also scaled from percentage to pixels and
  // clamped to ensure the crop window stays fully inside the source frame.
  const cropX = Math.max(
    0,
    Math.min(
      options.sourceWidth - cropWidth,
      Math.round((options.crop.x / 100) * options.sourceWidth),
    ),
  );
  const cropY = Math.max(
    0,
    Math.min(
      options.sourceHeight - cropHeight,
      Math.round((options.crop.y / 100) * options.sourceHeight),
    ),
  );

  const outputName = `${options.filename}${options.outputSuffix ?? ""}.${options.format}`;

  const args = [
    "-y",
    "-ss",
    String(options.trimRange[0]),
    "-to",
    String(options.trimRange[1]),
    "-i",
    options.inputPath,
    ...buildFormatArgs(options.format, options.crf),
  ];

  const videoFilters: string[] = [];

  // Only add a crop filter when the requested crop differs from the full frame.
  if (
    cropWidth !== options.sourceWidth ||
    cropHeight !== options.sourceHeight
  ) {
    videoFilters.push(`crop=${cropWidth}:${cropHeight}:${cropX}:${cropY}`);
  }

  if (options.format === "webm") {
    videoFilters.push("fps=30");
    videoFilters.push("scale=512:-1");
  }

  // Speed adjustment is handled with video and audio filters.
  if (options.speed && options.speed !== 1) {
    // Video speed changes use PTS scaling.
    videoFilters.push(`setpts=${(1 / options.speed).toFixed(6)}*PTS`);

    const atempo = options.speed;
    // FFmpeg's atempo filter only accepts values between 0.5 and 2.0.
    // For rates below 0.5, chain multiple atempo filters to reach the target.
    if (atempo > 0 && atempo < 0.5) {
      const factors: string[] = [];
      let remaining = atempo;
      while (remaining < 0.5) {
        factors.push("atempo=0.5");
        remaining *= 2;
      }
      factors.push(`atempo=${remaining.toFixed(6)}`);
      args.push("-filter:a", factors.join(","));
    } else {
      args.push("-filter:a", `atempo=${atempo.toFixed(6)}`);
    }
  }

  if (videoFilters.length) {
    args.push("-vf", videoFilters.join(","));
  }

  if (options.fps) args.push("-r", String(options.fps));

  if (options.customArgs)
    args.push(...options.customArgs.trim().split(/\s+/).filter(Boolean));

  args.push(
    "-progress",
    "pipe:2",
    "-nostats",
    path.join(OUTPUT_DIRECTORY, outputName),
  );

  return args;
}
