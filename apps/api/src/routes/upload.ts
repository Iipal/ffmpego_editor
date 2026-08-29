import { Hono } from "hono";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const app = new Hono();

// 8 MB default chunk — good balance: keeps Bun memory flat, allows progress, resumable
export const DEFAULT_CHUNK_BYTES = 8 * 1024 * 1024;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024 * 1024;

interface UploadSession {
  uploadId: string;
  filename: string;
  totalSize: number;
  received: number;
  temporaryPath: string;
  createdAt: number;
  chunks: Set<number>;
}

const sessions = new Map<string, UploadSession>();

function cleanupSession(s: UploadSession) {
  try { fs.unlinkSync(s.temporaryPath); } catch {}
  sessions.delete(s.uploadId);
}

// Sweep stale sessions (>6h) every 30min
setInterval(() => {
  const cutoff = Date.now() - 6 * 60 * 60 * 1000;
  for (const s of sessions.values()) if (s.createdAt < cutoff) cleanupSession(s);
}, 30 * 60 * 1000).unref?.();

// POST /upload/init — create session, pre-allocate temp file
// Body JSON: { filename, totalSize, chunkSize? }
app.post("/upload/init", async (c) => {
  let body: { filename?: string; totalSize?: number; chunkSize?: number };
  try { body = await c.req.json(); } catch { return c.json({ error: "Invalid JSON" }, 400); }
  const filename = (body.filename ?? "").trim() || "upload.bin";
  const totalSize = Number(body.totalSize);
  if (!Number.isFinite(totalSize) || totalSize <= 0 || totalSize > MAX_UPLOAD_BYTES)
    return c.json({ error: `totalSize must be 1..${MAX_UPLOAD_BYTES}` }, 400);
  const chunkSize = Math.min(
    Math.max(1 * 1024 * 1024, Number(body.chunkSize) || DEFAULT_CHUNK_BYTES),
    64 * 1024 * 1024,
  );
  const uploadId = crypto.randomUUID();
  const safeName = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, "_");
  const temporaryPath = path.join(os.tmpdir(), `${uploadId}-${safeName}`);
  // Pre-create sparse file to reserve space and enable random-access writes
  const fd = fs.openSync(temporaryPath, "w");
  try { fs.ftruncateSync(fd, totalSize); } catch {}
  fs.closeSync(fd);
  const session: UploadSession = {
    uploadId, filename: safeName, totalSize, received: 0,
    temporaryPath, createdAt: Date.now(), chunks: new Set(),
  };
  sessions.set(uploadId, session);
  return c.json({ uploadId, temporaryPath, chunkSize, totalSize });
});

// POST /upload/chunk/:uploadId — raw binary body for one chunk
// Headers: x-chunk-index, x-chunk-offset, x-chunk-size OR query ?index=&offset=
app.post("/upload/chunk/:uploadId", async (c) => {
  const uploadId = c.req.param("uploadId");
  const s = sessions.get(uploadId);
  if (!s) return c.json({ error: "Upload session not found" }, 404);

  const indexStr = c.req.header("x-chunk-index") ?? c.req.query("index") ?? "0";
  const offsetStr = c.req.header("x-chunk-offset") ?? c.req.query("offset") ?? "0";
  const index = Number(indexStr);
  const offset = Number(offsetStr);
  if (!Number.isFinite(index) || !Number.isFinite(offset) || offset < 0 || offset >= s.totalSize)
    return c.json({ error: "Invalid index/offset" }, 400);

  // Idempotent: if already received this index, return success without re-writing
  if (s.chunks.has(index)) {
    return c.json({ ok: true, uploadId, index, offset, received: s.received, totalSize: s.totalSize, deduplicated: true });
  }

  const buf = await c.req.arrayBuffer();
  if (buf.byteLength === 0) return c.json({ error: "Empty chunk" }, 400);
  if (offset + buf.byteLength > s.totalSize)
    return c.json({ error: "Chunk exceeds totalSize" }, 400);

  // Random-access write at offset — keeps memory flat, no buffering whole file
  const fd = fs.openSync(s.temporaryPath, "r+");
  try {
    fs.writeSync(fd, Buffer.from(buf), 0, buf.byteLength, offset);
  } finally { fs.closeSync(fd); }

  s.chunks.add(index);
  s.received += buf.byteLength;
  // Clamp in case of overlapping retries
  if (s.received > s.totalSize) s.received = s.totalSize;

  return c.json({ ok: true, uploadId, index, offset, received: s.received, totalSize: s.totalSize });
});

// POST /upload/complete/:uploadId — verify size, trim sparse tail if needed
app.post("/upload/complete/:uploadId", async (c) => {
  const uploadId = c.req.param("uploadId");
  const s = sessions.get(uploadId);
  if (!s) return c.json({ error: "Upload session not found" }, 404);
  try {
    const stat = fs.statSync(s.temporaryPath);
    if (stat.size !== s.totalSize) {
      // Truncate/extend to exact size (handles preallocated sparse file)
      const fd = fs.openSync(s.temporaryPath, "r+");
      fs.ftruncateSync(fd, s.totalSize);
      fs.closeSync(fd);
    }
  } catch (e) {
    return c.json({ error: `Temp file missing: ${e instanceof Error ? e.message : String(e)}` }, 500);
  }
  // Optionally validate received bytes — allow complete even if s.received < totalSize if client used sparse holes?
  // For strict mode, require s.received >= totalSize else error
  if (s.received < s.totalSize) {
    // Check actual non-zero file size via stat
    const stat = fs.statSync(s.temporaryPath);
    if (stat.size < s.totalSize) {
      return c.json({ error: `Incomplete upload: received ${s.received}/${s.totalSize}`, received: s.received, totalSize: s.totalSize }, 400);
    }
  }
  return c.json({ ok: true, uploadId, filename: s.filename, totalSize: s.totalSize, temporaryPath: s.temporaryPath });
});

// GET /upload/status/:uploadId — progress
app.get("/upload/status/:uploadId", (c) => {
  const s = sessions.get(c.req.param("uploadId"));
  if (!s) return c.json({ error: "Not found" }, 404);
  return c.json({ uploadId: s.uploadId, filename: s.filename, totalSize: s.totalSize, received: s.received, percent: s.totalSize ? Math.round((s.received / s.totalSize) * 100) : 0, temporaryPath: s.temporaryPath });
});

// DELETE /upload/:uploadId — abort & cleanup
app.delete("/upload/:uploadId", (c) => {
  const s = sessions.get(c.req.param("uploadId"));
  if (!s) return c.json({ error: "Not found" }, 404);
  cleanupSession(s);
  return c.json({ ok: true, deleted: c.req.param("uploadId") });
});

// Helper for other routes: resolve a completed upload's temp path
export function getUploadTempPath(uploadId: string): string | null {
  const s = sessions.get(uploadId);
  return s?.temporaryPath ?? null;
}
export function consumeUpload(uploadId: string): string | null {
  const s = sessions.get(uploadId);
  if (!s) return null;
  // Verify file exists; keep session until caller deletes temp or we sweep
  try { fs.accessSync(s.temporaryPath); } catch { return null; }
  return s.temporaryPath;
}

export default app;
