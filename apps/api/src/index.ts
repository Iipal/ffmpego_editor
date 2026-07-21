import { Hono } from "hono";
import { cors } from "hono/cors";
import videoRoutes from "./routes/video";
import metadataRoutes from "./routes/metadata";

const app = new Hono();
app.use("/api/*", cors());

// Health check
app.get('/', (c) => {
  return c.text('FFmpeg Editor API is running!');
});

app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    ffmpegPath: '/usr/bin/ffmpeg',
  });
});

// Mount routes
app.route('/api', videoRoutes);
app.route('/api', metadataRoutes);

const PORT = Number(Bun.env.PORT ?? 3100);

const server = Bun.serve({
  fetch: app.fetch,
  port: PORT,
});

console.log(`API Server running on ${server.url}`);
