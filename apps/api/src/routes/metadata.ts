import { Hono } from "hono";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { consumeUpload } from "./upload.js";

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
  // Allow either direct file upload OR reusable chunked uploadId (avoids re-uploading 10GB for metadata+transcode)
  const uploadIdHeader = c.req.header("x-upload-id") ?? c.req.query("uploadId");
  const includeFrames = c.req.query("includeFrames") === "true";
  const includePackets = c.req.query("includePackets") === "true";

  let temporaryPath: string;
  let filename: string;
  let isChunked = false;

  if (uploadIdHeader) {
    const p = consumeUpload(uploadIdHeader);
    if (!p) return c.json({ error: "Upload session not found or expired" }, 404);
    try { fs.accessSync(p); } catch { return c.json({ error: "Uploaded file not found on server" }, 404); }
    temporaryPath = p;
    filename = path.basename(p).replace(/^[0-9a-f-]{36}-/, "");
    isChunked = true;
  } else {
    let form: FormData;
    try {
      form = await c.req.formData();
    } catch (e) {
      console.error("[metadata] formData parse failed:", e);
      return c.json({ error: "Invalid multipart body / file too large" }, 400);
    }
    // also allow uploadId inside multipart (chunked flow)
    const uploadIdField = form.get("uploadId");
    if (typeof uploadIdField === "string" && uploadIdField.trim()) {
      const p = consumeUpload(uploadIdField.trim());
      if (!p) return c.json({ error: "Upload session not found or expired" }, 404);
      temporaryPath = p;
      filename = path.basename(p).replace(/^[0-9a-f-]{36}-/, "");
      isChunked = true;
    } else {
      const file = form.get("file");
      if (!(file instanceof File))
        return c.json({ error: "Video file is required" }, 400);
      temporaryPath = path.join(
        os.tmpdir(),
        `${crypto.randomUUID()}-${path.basename(file.name)}`,
      );
      await Bun.write(temporaryPath, file);
      filename = path.basename(file.name);
    }
  }
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
  // Only delete temp file if it was created for this single-shot request; chunked uploads are reused for transcode
  if (!isChunked) await Bun.$`rm -f ${temporaryPath}`;
  if (exitCode !== 0) return c.json({ error: "Unable to inspect video" }, 422);
  const result = (await new Response(process.stdout).json()) as FFprobeReport;
  const format = result.format ?? {};
  const streams = result.streams ?? [];
  const video = streams.find((stream) => stream.codec_type === "video");
  const audio = streams.find((stream) => stream.codec_type === "audio");
  if (!video) return c.json({ error: "No video stream found" }, 422);
  const [numerator, denominator] = String(video.r_frame_rate ?? "0/1")
    .split("/")
    .map(Number);
  return c.json({
    filename,
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
