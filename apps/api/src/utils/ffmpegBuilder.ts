import path from "node:path";

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
  crop: { x: number; y: number; width: number; height: number };
  format: "mp4" | "webm" | "mov";
  outputSuffix?: string;
  speed?: number;
  fps?: number;
  crf?: number;
  customArgs?: string;
  outputPath?: string;
  mobileLayout?: MobileLayoutForFFmpeg | null;
}

/**
 * Temporary output directory for rendered video files.
 *
 * Files are written as `temp_${jobId}.${format}` in the project root
 * and deleted after being served to the frontend.
 */
export const OUTPUT_DIRECTORY = ".";

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

  const outputName =
    options.outputPath ??
    `${options.filename}${options.outputSuffix ?? ""}.${options.format}`;

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

  // Mobile layout takes precedence - it builds its own filter_complex with speed handled inside
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
      ? `,setpts=${(1 / (options.speed as number)).toFixed(6)}*PTS`
      : "";
    if (ml.mode === "full" && ml.zones[0]) {
      const c = toCrop(ml.zones[0] as never);
      videoFilters.length = 0;
      videoFilters.push(
        `crop=${c.cw}:${c.ch}:${c.cx}:${c.cy}`,
        `scale=1080:1920:flags=lanczos${setpts}`,
      );
      if (hasSpeed) {
        const atempo = options.speed as number;
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
    } else if (ml.mode === "stacked" && ml.zones.length >= 2) {
      const a = toCrop(ml.zones[0] as never);
      const b = toCrop(ml.zones[1] as never);
      const split = Math.max(0.2, Math.min(0.8, ml.splitRatio ?? 0.5));
      const h1 = Math.round(1920 * split);
      const h2 = 1920 - h1;
      const filterComplex = `[0:v]crop=${a.cw}:${a.ch}:${a.cx}:${a.cy},scale=1080:${h1}:flags=lanczos${setpts}[z1];[0:v]crop=${b.cw}:${b.ch}:${b.cx}:${b.cy},scale=1080:${h2}:flags=lanczos${setpts}[z2];[z1][z2]vstack=inputs=2[v]`;
      if (hasSpeed) {
        const atempo = options.speed as number;
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
        args.push(
          "-filter_complex",
          filterComplex,
          "-map",
          "[v]",
          "-map",
          "0:a",
          `-filter:a`,
          afilter,
        );
      } else {
        args.push(
          "-filter_complex",
          filterComplex,
          "-map",
          "[v]",
          "-map",
          "0:a?",
        );
      }
      videoFilters.length = 0;
    }
  }

  // Non-mobile speed handling
  if (!options.mobileLayout && options.speed && options.speed !== 1) {
    videoFilters.push(`setpts=${(1 / options.speed).toFixed(6)}*PTS`);
    const atempo = options.speed;
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

  // Use the explicit outputPath if provided, otherwise fall back to OUTPUT_DIRECTORY.
  const finalOutputPath =
    options.outputPath ?? path.join(OUTPUT_DIRECTORY, outputName);

  args.push("-progress", "pipe:2", "-nostats", finalOutputPath);

  return args;
}
