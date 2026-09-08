import { Hono } from "hono";
import { consumeUpload } from "./upload.js";
import { extractVideoMetadata, type FFprobeReport } from "../utils/metadata.js";
import { systemError } from "../observability.js";
import { err } from "../http.js";
import {
  MULTIPART_FIELDS,
  UPLOAD_ID_HEADER,
  UPLOAD_ID_QUERY,
} from "@repo/contracts";
import {
  AssetStore,
  FileStoreQuotaError,
  store,
} from "../storage/index.js";

const app = new Hono();

app.post("/metadata", async (c) => {
  // Allow either direct file upload OR reusable chunked uploadId (avoids re-uploading 10GB for metadata+transcode)
  const uploadIdHeader =
    c.req.header(UPLOAD_ID_HEADER) ?? c.req.query(UPLOAD_ID_QUERY);
  const includeFrames = c.req.query("includeFrames") === "true";
  const includePackets = c.req.query("includePackets") === "true";

  let temporaryPath: string;
  let filename: string;
  // Single-shot request asset (record-before-bytes so a failed probe leaves
  // a tracked record, never a stray file). Released after probing.
  let assetId: string | null = null;

  if (uploadIdHeader) {
    const consumed = consumeUpload(uploadIdHeader);
    if (!consumed)
      return err(c, "UPLOAD_NOT_FOUND", {
        message: "Upload session not found or expired",
      });
    temporaryPath = consumed.path;
    filename = consumed.filename;
  } else {
    let form: FormData;
    try {
      form = await c.req.formData();
    } catch (e) {
      systemError("[metadata] formData parse failed:", e);
      return err(c, "INVALID_MULTIPART", {
        message: "Invalid multipart body / file too large",
      });
    }
    // also allow uploadId inside multipart (chunked flow)
    const uploadIdField = form.get(MULTIPART_FIELDS.uploadId);
    if (typeof uploadIdField === "string" && uploadIdField.trim()) {
      const consumed = consumeUpload(uploadIdField.trim());
      if (!consumed)
        return err(c, "UPLOAD_NOT_FOUND", {
          message: "Upload session not found or expired",
        });
      temporaryPath = consumed.path;
      filename = consumed.filename;
    } else {
      const file = form.get(MULTIPART_FIELDS.file);
      if (!(file instanceof File))
        return err(c, "FILE_REQUIRED", { message: "Video file is required" });
      const size = Number.isFinite(file.size) ? file.size : 0;
      const quota = store.checkQuota(size);
      if (!quota.ok) {
        return err(c, "QUOTA_EXCEEDED", {
          message: `Storage quota exceeded: need ${size} bytes, quota is ${quota.quotaBytes} bytes`,
          details: { neededBytes: size, quotaBytes: quota.quotaBytes },
        });
      }
      try {
        ({ id: assetId, path: temporaryPath } = AssetStore.reserve({
          kind: "request-input",
          filename: file.name || "upload.bin",
          mime: file.type || undefined,
          sizeHint: size,
        }));
      } catch (e) {
        if (e instanceof FileStoreQuotaError) {
          return err(c, "QUOTA_EXCEEDED", {
            message: e.message,
            details: { neededBytes: e.neededBytes, quotaBytes: e.quotaBytes },
          });
        }
        throw e;
      }
      try {
        await Bun.write(temporaryPath, file);
      } catch (e) {
        if (assetId) AssetStore.release(assetId);
        assetId = null;
        throw e;
      }
      AssetStore.finalize(assetId);
      filename = file.name;
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
    if (assetId) AssetStore.release(assetId);
    systemError("[metadata] ffprobe spawn failed:", e);
    return err(c, "INTERNAL", {
      message: "Video inspector unavailable (spawn failed)",
    });
  }
  const exitCode = await process.exited;
  // Only delete temp file if it was created for this single-shot request; chunked uploads are reused for transcode
  if (assetId) AssetStore.release(assetId);
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
