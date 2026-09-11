/**
 * First-class file endpoints:
 * - GET /api/storage/stats — observable store census (counts, bytes, quota).
 * - GET /api/files/:id/download — resolve an artifact/asset by opaque ID and
 *   stream it (job downloads funnel through the same helper, so both paths
 *   share range support + MIME mapping). Absolute paths never appear in
 *   requests or responses; unknown/deleted IDs are 404 (idempotent reads).
 */
import { Hono } from "hono";
import fs from "node:fs";
import { systemError, systemLog } from "../observability.js";
import { err, errResponse } from "../http.js";
import { liveUploadPaths } from "../db.js";
import { store, type FileRecord } from "../storage/index.js";

const app = new Hono();

export function lookup(id: string): FileRecord | null {
  if (!/^(ast|art)_[0-9a-f]{32}$/.test(id)) return null;
  return store.get(id);
}

/**
 * Stream a store record with Content-Length + single-range support.
 * Shared by GET /api/files/:id/download and the job download endpoint.
 */
export function streamFile(
  rec: FileRecord,
  rangeHeader: string | undefined,
): Response {
  let total: number;
  try {
    total = fs.statSync(rec.path).size;
  } catch (e) {
    systemError("[files/download] failed stating stored file:", rec.id, e);
    return errResponse("ASSET_NOT_FOUND", { message: "File not found." });
  }
  if (total <= 0) {
    return errResponse("OUTPUT_EMPTY", { message: "File is empty." });
  }
  const baseHeaders = {
    "Content-Type": rec.mime,
    "Content-Disposition": `attachment; filename="${rec.name}"`,
    "Cache-Control": "no-store",
    "Accept-Ranges": "bytes",
  };
  if (!rangeHeader) {
    return new Response(Bun.file(rec.path), {
      headers: { ...baseHeaders, "Content-Length": String(total) },
    });
  }
  // Single-range request (download resume + video seek): parse the bounds,
  // serve the slice natively via Bun.file. Anything unparseable is 416.
  const m = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  const rs = m?.[1] ?? "";
  const re = m?.[2] ?? "";
  let start = rs === "" ? total - Number(re) : Number(rs);
  let end = re === "" ? total - 1 : Number(re);
  if (
    !m ||
    (rs === "" && re === "") ||
    !Number.isFinite(start) ||
    !Number.isFinite(end)
  ) {
    return errResponse(
      "RANGE_INVALID",
      { message: "Invalid Range header." },
      { "Content-Range": `bytes */${total}` },
    );
  }
  start = Math.max(0, Math.min(start, total - 1));
  end = Math.max(start, Math.min(end, total - 1));
  return new Response(Bun.file(rec.path).slice(start, end + 1), {
    status: 206,
    headers: {
      ...baseHeaders,
      "Content-Length": String(end - start + 1),
      "Content-Range": `bytes ${start}-${end}/${total}`,
    },
  });
}

app.get("/storage/stats", (c) => {
  return c.json(store.stats());
});

app.post("/storage/sweep", (c) => {
  // On-demand store reconcile for the Admin storage dashboard: reap expired
  // rows, stale-reserved rows, rows whose bytes vanished, and store-root
  // orphans. Live job-owned files are never touched (keep-until-delete);
  // live upload sessions are pinned so slow uploads survive the sweep —
  // same shielding as the boot reconcile in src/index.ts. Idempotent: a
  // second run finds nothing and frees zero bytes.
  const pin = liveUploadPaths();
  const r = store.reconcile(Date.now(), { pin });
  if (r.expired + r.staleReserved + r.missing + r.orphans > 0) {
    systemLog(
      `storage sweep: freed ${r.bytesFreed} bytes (${r.orphans} orphans, ${r.expired} expired, ${r.staleReserved} stale-reserved, ${r.missing} missing)`,
    );
  }
  return c.json({ ...r, message: `Sweep freed ${r.bytesFreed} bytes.` });
});

app.get("/files/:id/download", (c) => {
  const rec = lookup(c.req.param("id"));
  if (!rec) return err(c, "ASSET_NOT_FOUND", { message: "File not found." });
  return streamFile(rec, c.req.header("Range") ?? c.req.header("range"));
});

export default app;
