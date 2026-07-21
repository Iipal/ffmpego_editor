import path from "node:path";

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

export const OUTPUT_DIRECTORY = path.join("/mnt/d/", "ffmpego_edits");

function buildFormatArgs(
  format: TranscodeOptions["format"],
  crf: number | undefined,
) {
  const normalizedCrf =
    typeof crf === "number" && Number.isFinite(crf)
      ? Math.max(0, Math.min(40, crf))
      : 23;

  switch (format) {
    case "webm":
      return [
        "-c:v",
        "libvpx-vp9",
        "-b:v",
        "0",
        "-crf",
        String(normalizedCrf),
        "-c:a",
        "libopus",
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
        "yuv444p",
        "-c:a",
        "aac",
      ].flat();
  }
}

export function buildFFmpegArgs(options: TranscodeOptions) {
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
  if (
    cropWidth !== options.sourceWidth ||
    cropHeight !== options.sourceHeight
  ) {
    videoFilters.push(`crop=${cropWidth}:${cropHeight}:${cropX}:${cropY}`);
  }
  if (options.speed && options.speed !== 1) {
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
  args.push(
    "-progress",
    "pipe:2",
    "-nostats",
    path.join(OUTPUT_DIRECTORY, outputName),
  );
  return args;
}
