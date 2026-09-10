import { Hono } from "hono";
import { cors } from "hono/cors";
import os from "node:os";
import videoRoutes, { getQueueStats } from "./routes/video.js";
import metadataRoutes from "./routes/metadata.js";
import audioRoutes from "./routes/audio.js";
import uploadRoutes from "./routes/upload.js";
import filesRoutes from "./routes/files.js";
import { liveUploadPaths, startupSweep } from "./db.js";
import { store } from "./storage/index.js";
import {
  formatBytes,
  getDiskFreeBytes,
  getFfmpegVersion,
  systemError,
  systemLog,
} from "./observability.js";

// B1: recover interrupted jobs + sweep orphan temp files from crashes.
const sweep = startupSweep();
if (sweep.recoveredJobs > 0 || sweep.deletedFiles > 0) {
  systemLog(
    `startup sweep: marked ${sweep.recoveredJobs} interrupted job(s) failed, deleted ${sweep.deletedFiles} orphan file(s)`,
  );
}
// AssetStore/ArtifactStore reconciliation: expired + stale-reserved rows,
// rows whose bytes vanished, and store-root files with no owning row.
// Live upload sessions are pinned so slow uploads survive a restart sweep.
{
  const pin = liveUploadPaths();
  const r = store.reconcile(Date.now(), { pin });
  if (r.expired + r.staleReserved + r.missing + r.orphans > 0) {
    systemLog(
      `store reconcile: freed ${r.bytesFreed} bytes (${r.orphans} orphans, ${r.expired} expired, ${r.staleReserved} stale-reserved, ${r.missing} missing)`,
    );
  }
}

const app = new Hono();
// Local-only: permissive CORS on every route, including the root ops
// endpoints (`GET /`, `GET /health`) that the web readiness dashboard
// polls cross-origin (:3050 → :3100). Scoping this to `/api/*` breaks
// browser fetches to `/health` (no ACAO header → blocked → "API
// unreachable"), while curl/cli keep working — a confusing split.
app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "DELETE", "OPTIONS", "PATCH", "PUT"],
    allowHeaders: ["*"],
    exposeHeaders: ["*"],
    credentials: false,
    maxAge: 86400,
  }),
);
app.onError((err, c) => {
  systemError("unhandled error:", err);
  return c.json(
    { error: err instanceof Error ? err.message : "Internal Server Error" },
    500,
  );
});
app.notFound((c) => c.json({ error: "Not Found" }, 404));

// Health check
app.get("/", (c) => {
  return c.text("FFmpeg Editor API is running!");
});

app.get("/health", (c) => {
  // B5: ops snapshot — ffmpeg build, tmpdir disk headroom, queue depth.
  // Disk/version probes are failure-tolerant (null when unavailable).
  const tmpdir = os.tmpdir();
  const diskFreeBytes = getDiskFreeBytes(tmpdir);
  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    ffmpegPath: "/usr/bin/ffmpeg",
    ffmpegVersion: getFfmpegVersion(),
    tmpdir,
    diskFreeBytes,
    diskFreeHuman: diskFreeBytes == null ? null : formatBytes(diskFreeBytes),
    queue: getQueueStats(),
  });
});

// Mount routes
app.route("/api", uploadRoutes);
app.route("/api", videoRoutes);
app.route("/api", metadataRoutes);
app.route("/api", audioRoutes);
app.route("/api", filesRoutes);

const PORT = Number(Bun.env.PORT ?? 3100);

const server = Bun.serve({
  fetch: app.fetch,
  port: PORT,
  idleTimeout: 255,
  // Allow large video uploads (10GB) — local-only app, bumped for .mkv / matroska workflows
  maxRequestBodySize: 10 * 1024 * 1024 * 1024,
});

console.log(`API Server running on ${server.url}`);
{
  const free = getDiskFreeBytes(os.tmpdir());
  systemLog(
    `ffmpeg: ${getFfmpegVersion() ?? "version probe failed"}; tmpdir ${os.tmpdir()} free ${free == null ? "unknown" : formatBytes(free)}`,
  );
}
