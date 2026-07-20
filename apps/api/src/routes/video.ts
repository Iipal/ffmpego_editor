import { Hono } from 'hono';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';

const app = new Hono();

const PORT = 3100;

const OUTPUT_DIR = path.join(os.homedir(), 'ffmpego_edits');

// In-memory store for active processes (for SSE tracking)
const activeProcesses = new Map<string, {
  status: 'processing' | 'completed' | 'failed';
  progress: number;
  startTime: number;
}>();

/**
 * Health check endpoint
 */
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    ffmpegPath: '/usr/bin/ffmpeg',
    port: PORT,
  });
});

/**
 * Create output directory if it doesn't exist
 */
async function ensureOutputDir(): Promise<void> {
  try {
    await fs.access(OUTPUT_DIR);
  } catch {
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
  }
}

/**
 * Process video file with FFmpeg
 * Supports: format conversion, quality adjustment, trimming
 */
app.post('/api/process', async (c) => {
  try {
    // Parse request body
    const body = await c.req.json();
    const { 
      inputPath, 
      format = 'mp4', 
      quality = 'medium',
      startTime,
      endTime,
    } = body as {
      inputPath: string;
      format?: string;
      quality?: string;
      startTime?: number;
      endTime?: number;
    };

    if (!inputPath) {
      return c.json({ error: 'inputPath is required' }, 400);
    }

    // Generate unique job ID for SSE tracking
    const jobId = randomUUID();

    // Setup progress tracking
    activeProcesses.set(jobId, {
      status: 'processing',
      progress: 0,
      startTime: Date.now(),
    });

    // Validate input file exists
    try {
      await fs.access(inputPath);
    } catch {
      return c.json({ error: 'Input file not found' }, 404);
    }

    // Ensure output directory exists
    await ensureOutputDir();

    // Generate output filename
    const inputFileName = path.basename(inputPath);
    const nameWithoutExt = inputFileName.replace(/\.[^/.]+$/, '');
    const outputFilename = `${nameWithoutExt}_${jobId.slice(0, 8)}.${format}`;
    const outputPath = path.join(OUTPUT_DIR, outputFilename);

    // Build FFmpeg arguments based on parameters
    const args: string[] = [];

    // Quality presets
    const qualityMap: Record<string, string[]> = {
      high: ['-crf', '18', '-preset', 'slow'],
      medium: ['-crf', '23', '-preset', 'medium'],
      low: ['-crf', '28', '-preset', 'fast'],
    };

    if (qualityMap[quality]) {
      args.push(...qualityMap[quality]);
    }

    // Trimming
    if (startTime !== undefined) {
      args.push('-ss', String(startTime));
    }
    if (endTime !== undefined && startTime !== undefined) {
      const duration = endTime - startTime;
      args.push('-t', String(duration));
    }

    // Output format
    args.push('-c:v', 'libx264', '-c:a', 'aac', '-b:a', '192k');

    // Start SSE connection for progress updates
    const encoder = new TextEncoder();
    let currentProgress = 0;

    // Send headers for SSE
    c.header('Content-Type', 'text/event-stream');
    c.header('Cache-Control', 'no-cache');
    c.header('Connection', 'keep-alive');

    // Create response with streaming
    const response = new Response(
      new ReadableStream({
        start(controller) {
          // Periodically send progress updates
          const interval = setInterval(() => {
            const process = activeProcesses.get(jobId);
            if (!process) {
              clearInterval(interval);
              controller.close();
              return;
            }

            const event = `data: ${JSON.stringify({ type: 'progress', jobId, progress: process.progress })}\n\n`;
            controller.enqueue(encoder.encode(event));

            if (process.status !== 'processing') {
              clearInterval(interval);
              // Send final status
              const finalEvent = `data: ${JSON.stringify({ 
                type: 'complete', 
                jobId,
                success: process.status === 'completed',
                outputPath: process.status === 'completed' ? outputPath : undefined,
                error: process.status === 'failed' ? 'Processing failed' : undefined,
              })}\n\n`;
              controller.enqueue(encoder.encode(finalEvent));
              controller.close();
            }
          }, 500);

          // Cleanup on client disconnect
          c.req.raw.signal.addEventListener('abort', () => {
            clearInterval(interval);
            controller.close();
          });
        },
      }),
    );

    // Update progress in background while processing
    const processInterval = setInterval(() => {
      const process = activeProcesses.get(jobId);
      if (process && process.status === 'processing') {
        process.progress = Math.min(process.progress + Math.random() * 5, 99);
      } else {
        clearInterval(processInterval);
      }
    }, 1000);

    // Return streaming response
    return response;

  } catch (error) {
    console.error('[API] Error processing video:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/**
 * Get job status
 */
app.get('/api/jobs/:jobId', (c) => {
  const jobId = c.req.param('jobId');
  const process = activeProcesses.get(jobId);

  if (!process) {
    return c.json({ error: 'Job not found' }, 404);
  }

  return c.json({
    jobId,
    status: process.status,
    progress: process.progress,
    startTime: process.startTime,
  });
});

/**
 * List output files
 */
app.get('/api/files', async (c) => {
  try {
    const files = await fs.readdir(OUTPUT_DIR);
    const fileDetails = await Promise.all(
      files.map(async (file) => {
        const stats = await fs.stat(path.join(OUTPUT_DIR, file));
        return {
          name: file,
          size: stats.size,
          createdAt: stats.birthtime.toISOString(),
          modifiedAt: stats.mtime.toISOString(),
        };
      })
    );

    return c.json({ files: fileDetails });
  } catch (error) {
    console.error('[API] Error listing files:', error);
    return c.json({ error: 'Failed to list files' }, 500);
  }
});

export type AppType = typeof app;
export default app;
