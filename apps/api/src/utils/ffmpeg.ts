import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const FFMPEG_PATH = '/usr/bin/ffmpeg';

interface FFmpegOptions {
  inputPath: string;
  outputPath: string;
  args: string[];
}

export interface ProgressEvent {
  type: 'progress';
  progress: number;
  speed?: string;
  time?: string;
}

export interface CompleteEvent {
  type: 'complete';
  success: boolean;
  outputPath?: string;
  error?: string;
}

export type FFmpegEvent = ProgressEvent | CompleteEvent;

/**
 * Ensure the output directory exists
 */
async function ensureOutputDir(): Promise<void> {
  const outputDir = getOutputDir();
  try {
    await fs.access(outputDir);
  } catch {
    await fs.mkdir(outputDir, { recursive: true });
  }
}

/**
 * Get the output directory path (~//ffmpego_edits/)
 */
export function getOutputDir(): string {
  return path.join(os.homedir(), 'ffmpego_edits');
}

/**
 * Execute FFmpeg with streaming progress updates
 */
export function executeFFmpeg(options: FFmpegOptions): Promise<CompleteEvent> {
  return new Promise((resolve) => {
    const command = FFMPEG_PATH;
    const allArgs = ['-y', ...options.args, '-i', options.inputPath, options.outputPath];

    console.log(`[FFmpeg] Starting: ${command} ${allArgs.join(' ')}`);

    const child = spawn(command, allArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let progress = 0;
    let speed = '';
    let time = '';

    // Parse stderr for progress information
    child.stderr.on('data', (data) => {
      const output = data.toString();
      
      // Extract progress percentage from frames
      const progressMatch = output.match(/frame=\s*(\d+)/);
      if (progressMatch) {
        // Estimate progress based on total frames if available
        const totalFramesMatch = output.match(/Total frames:\s*(\d+)/);
        if (totalFramesMatch) {
          const current = parseInt(progressMatch[1]);
          const total = parseInt(totalFramesMatch[1]);
          progress = Math.min((current / total) * 100, 99);
        } else {
          // Fallback: estimate based on time
          const timeMatch = output.match(/time=(\d+):(\d+):(\d+)/);
          if (timeMatch) {
            const seconds = parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseInt(timeMatch[3]);
            progress = Math.min((seconds / 180) * 100, 99); // Assume max 3 min video
          }
        }
      }

      // Extract speed
      const speedMatch = output.match(/speed=(\S+)/);
      if (speedMatch) {
        speed = speedMatch[1];
      }

      // Extract time
      const timeMatch = output.match(/time=(\d+):(\d+):(\d+)/);
      if (timeMatch) {
        time = `${timeMatch[1]}:${timeMatch[2]}:${timeMatch[3]}`;
      }

      // Send progress event via callback
      onProgress?.({
        type: 'progress',
        progress,
        speed,
        time,
      });
    });

    let onProgress: ((event: ProgressEvent) => void) | null = null;

    child.on('close', (code) => {
      if (code === 0) {
        resolve({
          type: 'complete',
          success: true,
          outputPath: options.outputPath,
        });
      } else {
        resolve({
          type: 'complete',
          success: false,
          error: `FFmpeg exited with code ${code}`,
        });
      }
    });

    child.on('error', (err) => {
      resolve({
        type: 'complete',
        success: false,
        error: err.message,
      });
    });

    // Return a function to set progress callback for SSE
    return { onProgress }: { onProgress: (cb: (event: ProgressEvent) => void) => void };
  });
}
