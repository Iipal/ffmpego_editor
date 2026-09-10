import { Hono } from "hono";
import fs from "node:fs";
import os from "node:os";
import {
  deleteUpload,
  getUpload,
  insertUpload,
  listUploads,
  updateUpload,
} from "../db.js";
import { getDiskFreeBytes, uploadLog } from "../observability.js";
import { err } from "../http.js";
import {
  AssetStore,
  FileStoreQuotaError,
  safeFilename,
  store,
} from "../storage/index.js";

const app = new Hono();

// 8 MB default chunk — good balance: keeps Bun memory flat, allows progress, resumable
export const DEFAULT_CHUNK_BYTES = 8 * 1024 * 1024;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024 * 1024;

function removeSessionFiles(uploadId: string) {
  const s = getUpload(uploadId);
  // Refcount-aware: a job that consumed this upload holds its own reference,
  // so aborting the session never deletes bytes a live job is rendering.
  if (s?.fileId) AssetStore.release(s.fileId);
  else if (s) {
    try {
      fs.unlinkSync(s.temporaryPath);
    } catch {}
  }
  deleteUpload(uploadId);
}

// Sweep stale sessions (>6h) every 30min — DB-backed so it survives restarts.
// Also reaps expired/stale store records (failed single-shot inputs, etc.).
setInterval(
  () => {
    const cutoff = Date.now() - 6 * 60 * 60 * 1000;
    for (const u of listUploads()) {
      if (u.createdAt < cutoff) removeSessionFiles(u.uploadId);
    }
    const swept = store.sweepExpired();
    if (swept.expired + swept.staleReserved > 0) {
      uploadLog(
        "sweep",
        `reaped ${swept.expired} expired + ${swept.staleReserved} stale-reserved file(s)`,
      );
    }
  },
  30 * 60 * 1000,
).unref?.();

// POST /upload/init — create session, pre-allocate temp file
// Body JSON: { filename, totalSize, chunkSize? }
app.post("/upload/init", async (c) => {
  let body: { filename?: string; totalSize?: number; chunkSize?: number };
  try {
    body = await c.req.json();
  } catch {
    return err(c, "INVALID_JSON", { message: "Invalid JSON" });
  }
  const filename = (body.filename ?? "").trim() || "upload.bin";
  const totalSize = Number(body.totalSize);
  if (
    !Number.isFinite(totalSize) ||
    totalSize <= 0 ||
    totalSize > MAX_UPLOAD_BYTES
  )
    return err(c, "VALIDATION_FAILED", {
      message: `totalSize must be 1..${MAX_UPLOAD_BYTES}`,
    });
  const chunkSize = Math.min(
    Math.max(1 * 1024 * 1024, Number(body.chunkSize) || DEFAULT_CHUNK_BYTES),
    64 * 1024 * 1024,
  );
  // B5: disk-quota gate — refuse to pre-allocate when tmpdir cannot hold the
  // declared file (507 so clients can surface "server disk full" distinctly).
  const diskFree = getDiskFreeBytes(os.tmpdir());
  if (diskFree != null && totalSize > diskFree) {
    return err(c, "DISK_FULL", {
      message: `Insufficient server disk space: need ${totalSize} bytes, ${diskFree} available`,
      details: { neededBytes: totalSize, diskFreeBytes: diskFree },
    });
  }
  const quota = store.checkQuota(totalSize);
  if (!quota.ok) {
    return err(c, "QUOTA_EXCEEDED", {
      message: `Storage quota exceeded: need ${totalSize} bytes, quota is ${quota.quotaBytes} bytes`,
      details: { neededBytes: totalSize, quotaBytes: quota.quotaBytes },
    });
  }
  const uploadId = crypto.randomUUID();
  const safeName = safeFilename(filename, "upload.bin");
  // Record-before-bytes: the asset row owns this path before anything is
  // written, so an aborted init can never leave an untracked file.
  let assetId: string;
  let temporaryPath: string;
  try {
    ({ id: assetId, path: temporaryPath } = AssetStore.reserve({
      kind: "upload",
      filename: safeName,
      sizeHint: totalSize,
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
  // Pre-create sparse file to reserve space and enable random-access writes
  const fd = fs.openSync(temporaryPath, "w");
  try {
    fs.ftruncateSync(fd, totalSize);
  } catch {}
  fs.closeSync(fd);
  insertUpload({
    uploadId,
    filename: safeName,
    totalSize,
    received: 0,
    temporaryPath,
    fileId: assetId,
    createdAt: Date.now(),
    chunks: [],
  });
  uploadLog(
    uploadId,
    `init ${safeName} (${totalSize} bytes, chunk ${chunkSize}) → ${assetId}`,
  );
  return c.json({ uploadId, assetId, chunkSize, totalSize });
});

// POST /upload/chunk/:uploadId — raw binary body for one chunk
// Headers: x-chunk-index, x-chunk-offset, x-chunk-size OR query ?index=&offset=
app.post("/upload/chunk/:uploadId", async (c) => {
  const uploadId = c.req.param("uploadId");
  const s = getUpload(uploadId);
  if (!s)
    return err(c, "UPLOAD_NOT_FOUND", { message: "Upload session not found" });

  const indexStr = c.req.header("x-chunk-index") ?? c.req.query("index") ?? "0";
  const offsetStr =
    c.req.header("x-chunk-offset") ?? c.req.query("offset") ?? "0";
  const index = Number(indexStr);
  const offset = Number(offsetStr);
  if (
    !Number.isFinite(index) ||
    !Number.isFinite(offset) ||
    offset < 0 ||
    offset >= s.totalSize
  )
    return err(c, "CHUNK_INVALID", { message: "Invalid index/offset" });

  // Idempotent: if already received this index, return success without re-writing
  if (s.chunks.includes(index)) {
    return c.json({
      ok: true,
      uploadId,
      index,
      offset,
      received: s.received,
      totalSize: s.totalSize,
      deduplicated: true,
    });
  }

  const buf = await c.req.arrayBuffer();
  if (buf.byteLength === 0)
    return err(c, "CHUNK_INVALID", { message: "Empty chunk" });
  if (offset + buf.byteLength > s.totalSize)
    return err(c, "CHUNK_INVALID", { message: "Chunk exceeds totalSize" });

  // Resolve through the owning asset record (mirror fallback for legacy rows).
  const targetPath = s.fileId
    ? (AssetStore.get(s.fileId)?.path ?? s.temporaryPath)
    : s.temporaryPath;
  // Random-access write at offset — keeps memory flat, no buffering whole file
  const fd = fs.openSync(targetPath, "r+");
  try {
    fs.writeSync(fd, Buffer.from(buf), 0, buf.byteLength, offset);
  } finally {
    fs.closeSync(fd);
  }

  const chunks = [...s.chunks, index];
  let received = s.received + buf.byteLength;
  // Clamp in case of overlapping retries
  if (received > s.totalSize) received = s.totalSize;
  updateUpload(uploadId, { received, chunks });
  // Keep the asset row fresh so slow-but-live sessions aren't reaped as stale.
  if (s.fileId) AssetStore.touch(s.fileId);

  return c.json({
    ok: true,
    uploadId,
    index,
    offset,
    received,
    totalSize: s.totalSize,
  });
});

// POST /upload/complete/:uploadId — verify size, trim sparse tail if needed
app.post("/upload/complete/:uploadId", async (c) => {
  const uploadId = c.req.param("uploadId");
  const s = getUpload(uploadId);
  if (!s)
    return err(c, "UPLOAD_NOT_FOUND", { message: "Upload session not found" });
  try {
    const stat = fs.statSync(s.temporaryPath);
    if (stat.size !== s.totalSize) {
      // Truncate/extend to exact size (handles preallocated sparse file)
      const fd = fs.openSync(s.temporaryPath, "r+");
      fs.ftruncateSync(fd, s.totalSize);
      fs.closeSync(fd);
    }
  } catch {
    // Generic message: fs errors embed the absolute store path.
    return err(c, "STORE_ERROR", {
      message: "Upload temp file is missing or unreadable.",
    });
  }
  // Optionally validate received bytes — allow complete even if s.received < totalSize if client used sparse holes?
  // For strict mode, require s.received >= totalSize else error
  if (s.received < s.totalSize) {
    // Check actual non-zero file size via stat
    const stat = fs.statSync(s.temporaryPath);
    if (stat.size < s.totalSize) {
      return err(c, "UPLOAD_INCOMPLETE", {
        message: `Incomplete upload: received ${s.received}/${s.totalSize}`,
        details: { received: s.received, totalSize: s.totalSize },
      });
    }
  }
  // Record the real byte size on the owning asset (quota accounting).
  if (s.fileId) AssetStore.finalize(s.fileId, s.totalSize);
  return c.json({
    ok: true,
    uploadId,
    filename: s.filename,
    totalSize: s.totalSize,
    assetId: s.fileId,
  });
});

// GET /upload/sessions — list open sessions for the Admin dashboard so
// orphaned uploads (abandoned before complete) are visible + abortable
// instead of sitting until the 6h server sweep. Newest first.
app.get("/upload/sessions", (c) => {
  const now = Date.now();
  const sessions = listUploads()
    .map((s) => ({
      uploadId: s.uploadId,
      filename: s.filename,
      totalSize: s.totalSize,
      received: s.received,
      percent: s.totalSize ? Math.round((s.received / s.totalSize) * 100) : 0,
      createdAt: s.createdAt,
      ageSeconds: Math.max(0, Math.round((now - s.createdAt) / 1000)),
      assetId: s.fileId,
    }))
    .sort((a, b) => b.createdAt - a.createdAt);
  return c.json({ count: sessions.length, sessions });
});

// GET /upload/status/:uploadId — progress
app.get("/upload/status/:uploadId", (c) => {
  const s = getUpload(c.req.param("uploadId"));
  if (!s) return err(c, "UPLOAD_NOT_FOUND", { message: "Not found" });
  return c.json({
    uploadId: s.uploadId,
    filename: s.filename,
    totalSize: s.totalSize,
    received: s.received,
    percent: s.totalSize ? Math.round((s.received / s.totalSize) * 100) : 0,
    // Received chunk indices — the authoritative skip-set for client resume
    // (robust when the resuming client picks a different chunk size).
    chunks: [...s.chunks].sort((a, b) => a - b),
    assetId: s.fileId,
  });
});

// DELETE /upload/:uploadId — abort & cleanup (refcount-aware, see above)
app.delete("/upload/:uploadId", (c) => {
  const s = getUpload(c.req.param("uploadId"));
  if (!s) return err(c, "UPLOAD_NOT_FOUND", { message: "Not found" });
  removeSessionFiles(s.uploadId);
  return c.json({ ok: true, deleted: c.req.param("uploadId") });
});

export interface ConsumedUpload {
  assetId: string | null;
  path: string;
  filename: string;
}

// Helper for other routes: resolve a completed upload's file. Takes no
// reference — transient consumers (metadata probe) just read the bytes,
// while job creators follow up with AssetStore.share/adopt so the bytes
// survive session cleanup while the job needs them.
// Upload rows persist in SQLite so metadata + transcode can reuse the same
// uploadId without re-uploading.
export function consumeUpload(uploadId: string): ConsumedUpload | null {
  const s = getUpload(uploadId);
  if (!s) return null;
  const rec = s.fileId ? AssetStore.get(s.fileId) : null;
  const filePath = rec?.path ?? s.temporaryPath;
  try {
    fs.accessSync(filePath);
  } catch {
    return null;
  }
  return { assetId: rec?.id ?? s.fileId, path: filePath, filename: s.filename };
}

export default app;
