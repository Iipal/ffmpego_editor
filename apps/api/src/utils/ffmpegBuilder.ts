import path from "node:path";

export interface TranscodeOptions {
  inputPath: string;
  filename: string;
  sourceWidth: number;
  sourceHeight: number;
  trimRange: [number, number];
  crop: { x: number; y: number; width: number; height: number };
  format: string;
  outputSuffix?: string;
  speed?: number;
  fps?: number;
  quality?: "standard" | "lossless";
  customArgs?: string;
}

export const OUTPUT_DIRECTORY = path.join("/mnt/d/", "ffmpego_edits");

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
  const outputName = `${path.parse(options.filename).name}${options.outputSuffix ?? ""}.${options.format}`;
  const args = [
    "-y",
    "-ss",
    String(options.trimRange[0]),
    "-to",
    String(options.trimRange[1]),
    "-i",
    options.inputPath,
  ];
  const videoFilters: string[] = [];
  if (cropWidth !== options.sourceWidth || cropHeight !== options.sourceHeight) {
    videoFilters.push(`crop=${cropWidth}:${cropHeight}:${cropX}:${cropY}`);
  }
  if (options.speed && options.speed !== 1) {
    videoFilters.push(`setpts=${(1 / options.speed).toFixed(6)}*PTS`);
    const atempo = options.speed;
    if (atempo > 0 && atempo < 0.5) {
      const factors: number[] = [];
      let remaining = atempo;
      while (remaining < 0.5) {
        factors.push(0.5);
        remaining *= 2;
      }
      factors.push(remaining);
      args.push("-filter:a", factors.map((value) => `atempo=${value.toFixed(6)}`).join(","));
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
  if (options.quality === "lossless" && options.format === "mp4") {
    args.push("-c:v", "libx264", "-crf", "0", "-pix_fmt", "yuv444p");
  }
  args.push("-progress", "pipe:2", "-nostats", path.join(OUTPUT_DIRECTORY, outputName));
  return args;
}
