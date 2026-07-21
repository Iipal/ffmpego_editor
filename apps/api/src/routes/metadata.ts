import { Hono } from "hono";
import os from "node:os";
import path from "node:path";

const app = new Hono();

interface FFprobeReport {
  format?: Record<string, unknown>;
  streams?: Array<Record<string, unknown>>;
  programs?: Array<Record<string, unknown>>;
  chapters?: Array<Record<string, unknown>>;
  frames?: Array<Record<string, unknown>>;
  packets?: Array<Record<string, unknown>>;
  packets_and_frames?: Array<Record<string, unknown>>;
  program_version?: Record<string, unknown>;
  library_versions?: Array<Record<string, unknown>>;
  error?: Record<string, unknown>;
}

app.post("/metadata", async (c) => {
  const form = await c.req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return c.json({ error: "Video file is required" }, 400);
  const includeFrames = c.req.query("includeFrames") === "true";
  const includePackets = c.req.query("includePackets") === "true";
  const temporaryPath = path.join(os.tmpdir(), `${crypto.randomUUID()}-${path.basename(file.name)}`);
  await Bun.write(temporaryPath, file);
  const args = [
    "ffprobe",
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    "-show_programs",
    "-show_chapters",
    "-show_error",
    "-show_private_data",
    "-show_versions",
  ];
  if (includeFrames) args.push("-show_frames");
  if (includePackets) args.push("-show_packets");
  args.push(temporaryPath);
  const process = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });
  const exitCode = await process.exited;
  await Bun.$`rm -f ${temporaryPath}`;
  if (exitCode !== 0) return c.json({ error: "Unable to inspect video" }, 422);
  const result = await new Response(process.stdout).json() as FFprobeReport;
  const format = result.format ?? {};
  const streams = result.streams ?? [];
  const video = streams.find((stream) => stream.codec_type === "video");
  const audio = streams.find((stream) => stream.codec_type === "audio");
  if (!video) return c.json({ error: "No video stream found" }, 422);
  const [numerator, denominator] = String(video.r_frame_rate ?? "0/1").split("/").map(Number);
  return c.json({
    filename: path.basename(file.name),
    containerFormat: String(format.format_name ?? ""),
    durationSeconds: Number(format.duration),
    width: Number(video.width),
    height: Number(video.height),
    frameRate: denominator ? numerator / denominator : 0,
    videoCodec: String(video.codec_name ?? ""),
    audioCodec: audio?.codec_name ? String(audio.codec_name) : undefined,
    bitrateKbps: Math.round(Number(format.bit_rate ?? 0) / 1000),
    ffprobe: result,
  });
});

export default app;
