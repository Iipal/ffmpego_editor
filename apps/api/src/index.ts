import { Hono } from "hono";
import { cors } from "hono/cors";
import videoRoutes from "./routes/video.js";
import metadataRoutes from "./routes/metadata.js";
import uploadRoutes from "./routes/upload.js";

const app = new Hono();
app.use("/api/*", cors({
  origin: "*",
  allowMethods: ["GET", "POST", "DELETE", "OPTIONS", "PATCH", "PUT"],
  allowHeaders: ["*"],
  exposeHeaders: ["*"],
  credentials: false,
  maxAge: 86400,
}));
app.onError((err, c) => {
  console.error("[api] unhandled error:", err);
  return c.json({ error: err instanceof Error ? err.message : "Internal Server Error" }, 500);
});
app.notFound((c) => c.json({ error: "Not Found" }, 404));

// Health check
app.get("/", (c) => {
  return c.text("FFmpeg Editor API is running!");
});

app.get("/health", (c) => {
  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    ffmpegPath: "/usr/bin/ffmpeg",
  });
});

// Mount routes
app.route("/api", uploadRoutes);
app.route("/api", videoRoutes);
app.route("/api", metadataRoutes);

const PORT = Number(Bun.env.PORT ?? 3100);

const server = Bun.serve({
  fetch: app.fetch,
  port: PORT,
  idleTimeout: 255,
  // Allow large video uploads (10GB) — local-only app, bumped for .mkv / matroska workflows
  maxRequestBodySize: 10 * 1024 * 1024 * 1024,
});

console.log(`API Server running on ${server.url}`);
