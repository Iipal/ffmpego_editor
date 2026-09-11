import { Hono } from "hono";
import { resolveRequestInput } from "./input.js";
import { extractVideoMetadata, type FFprobeReport } from "../utils/metadata.js";
import { systemError } from "../observability.js";
import { err, quotaExceeded } from "../http.js";
import { UPLOAD_ID_HEADER, UPLOAD_ID_QUERY } from "@repo/contracts";
import { FileStoreQuotaError, store } from "../storage/index.js";

const app = new Hono();

app.post("/metadata", async (c) => {
  // Allow either direct file upload OR reusable chunked uploadId (avoids re-uploading 10GB for metadata+transcode)
  const uploadIdHeader =
    c.req.header(UPLOAD_ID_HEADER) ?? c.req.query(UPLOAD_ID_QUERY);
  const includeFrames = c.req.query("includeFrames") === "true";
  const includePackets = c.req.query("includePackets") === "true";

  // Chunked sessions skip multipart parsing; direct uploads parse the form.
  let form: FormData | null = null;
  if (!uploadIdHeader) {
    try {
      form = await c.req.formData();
    } catch (e) {
      systemError("[metadata] formData parse failed:", e);
      return err(c, "INVALID_MULTIPART", {
        message: "Invalid multipart body / file too large",
      });
    }
  }
  let resolved: Awaited<ReturnType<typeof resolveRequestInput>>;
  try {
    resolved = await resolveRequestInput(c, form);
  } catch (e) {
    if (e instanceof FileStoreQuotaError) {
      return quotaExceeded(c, e.neededBytes, e.quotaBytes);
    }
    throw e;
  }
  if (!resolved.ok) {
    return resolved.reason === "upload-not-found"
      ? err(c, "UPLOAD_NOT_FOUND", {
          message: "Upload session not found or expired",
        })
      : err(c, "FILE_REQUIRED", { message: "Video file is required" });
  }
  const temporaryPath = resolved.input.temporaryPath;
  const filename = resolved.input.filename;
  // Single-shot request asset (record-before-bytes so a failed probe leaves
  // a tracked record, never a stray file). Released after probing; chunked
  // session bytes stay for transcode reuse.
  const assetId = resolved.input.remove ? resolved.input.assetId : null;
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
    if (assetId) store.release(assetId);
    systemError("[metadata] ffprobe spawn failed:", e);
    return err(c, "INTERNAL", {
      message: "Video inspector unavailable (spawn failed)",
    });
  }
  const exitCode = await process.exited;
  // Only delete temp file if it was created for this single-shot request; chunked uploads are reused for transcode
  if (assetId) store.release(assetId);
  if (exitCode !== 0) {
    const stderr = await new Response(process.stderr as ReadableStream)
      .text()
      .catch(() => "");
    return err(c, "FFPROBE_FAILED", {
      message: "Unable to inspect video — ffprobe rejected the file",
      details: { ffprobeStderr: stderr.slice(-2000) },
    });
  }
  const result = (await new Response(
    process.stdout as ReadableStream,
  ).json()) as FFprobeReport;
  const parsed = extractVideoMetadata(result, filename);
  if (!parsed.ok) {
    return err(c, "UNSUPPORTED_MEDIA", {
      message:
        parsed.error === "no-video-stream"
          ? "No video stream found — file contains no video track"
          : "Empty ffprobe report — file is not a readable media container",
    });
  }
  return c.json(parsed.metadata);
});

export default app;
