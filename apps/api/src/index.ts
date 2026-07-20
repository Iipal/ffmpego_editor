import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import videoRoutes from './routes/video';

const app = new Hono();

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

const PORT = 3000;

serve({
  fetch: app.fetch,
  port: PORT,
});

console.log(`🚀 API Server running on http://localhost:${PORT}`);
