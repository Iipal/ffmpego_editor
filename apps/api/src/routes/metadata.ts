import { Hono } from "hono";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { consumeUpload } from "./upload.js";
import { extractVideoMetadata, type FFprobeReport } from "../utils/metadata.js";
import { systemError } from "../observability.js";

const app = new Hono();

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
    if (!p)
      return c.json({ error: "Upload session not found or expired" }, 404);
    try {
      fs.accessSync(p);
    } catch {
      return c.json({ error: "Uploaded file not found on server" }, 404);
    }
    temporaryPath = p;
    filename = path.basename(p).replace(/^[0-9a-f-]{36}-/, "");
    isChunked = true;
  } else {
    let form: FormData;
    try {
      form = await c.req.formData();
    } catch (e) {
      systemError("[metadata] formData parse failed:", e);
      return c.json({ error: "Invalid multipart body / file too large" }, 400);
    }
    // also allow uploadId inside multipart (chunked flow)
    const uploadIdField = form.get("uploadId");
    if (typeof uploadIdField === "string" && uploadIdField.trim()) {
      const p = consumeUpload(uploadIdField.trim());
      if (!p)
        return c.json({ error: "Upload session not found or expired" }, 404);
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
  // B5: distinguish "ffprobe binary failed to run" (500, ops problem) from
  // "ran but rejected the file" (422, media problem) from "valid file but no
  // video stream" (422, distinct message for the UI).
  let process: ReturnType<typeof Bun.spawn>;
  try {
    process = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });
  } catch (e) {
    if (!isChunked) await Bun.$`rm -f ${temporaryPath}`;
    systemError("[metadata] ffprobe spawn failed:", e);
    return c.json({ error: "Video inspector unavailable (spawn failed)" }, 500);
  }
  const exitCode = await process.exited;
  // Only delete temp file if it was created for this single-shot request; chunked uploads are reused for transcode
  if (!isChunked) await Bun.$`rm -f ${temporaryPath}`;
  if (exitCode !== 0) {
    const stderr = await new Response(process.stderr as ReadableStream)
      .text()
      .catch(() => "");
    return c.json(
      {
        error: "Unable to inspect video — ffprobe rejected the file",
        ffprobeStderr: stderr.slice(-2000),
      },
      422,
    );
  }
  const result = (await new Response(
    process.stdout as ReadableStream,
  ).json()) as FFprobeReport;
  const parsed = extractVideoMetadata(result, filename);
  if (!parsed.ok) {
    return c.json(
      {
        error:
          parsed.error === "no-video-stream"
            ? "No video stream found — file contains no video track"
            : "Empty ffprobe report — file is not a readable media container",
      },
      422,
    );
  }
  return c.json(parsed.metadata);
});

export default app;
