import os from "node:os";
import path from "node:path";
import { Hono } from "hono";
import { buildFFmpegArgs, OUTPUT_DIRECTORY } from "../utils/ffmpegBuilder.js";

type JobStatus = "processing" | "completed" | "failed";

interface TranscodeSettings {
  sourceWidth: number;
  sourceHeight: number;
  trimRange: [number, number];
  crop: { x: number; y: number; width: number; height: number };
  exportFormat: "mp4" | "webm" | "mov";
  exportFps: number;
  exportFilename: string;
  exportQuality: number;
  exportSpeed: number;
  customFFmpegArgs: string;
}

interface TranscodeJob {
  status: JobStatus;
  progress: number;
  outputPath: string;
  alternateOutputPath?: string;
  error?: string;
}

const app = new Hono();
const jobs = new Map<string, TranscodeJob>();

function parseSettings(
  value: FormDataEntryValue | null,
): TranscodeSettings | null {
  if (typeof value !== "string") return null;
  try {
    const settings = JSON.parse(value) as TranscodeSettings;
    console.log("Parsed settings:", settings);
    console.log({
      sourceWidth: !Number.isFinite(settings.sourceWidth),
      sourceHeight: !Number.isFinite(settings.sourceHeight),
      trimRangeInvalid:
        !Array.isArray(settings.trimRange) || settings.trimRange.length !== 2,
      cropInvalid: !settings.crop,
      exportFpsInvalid: !Number.isFinite(settings.exportFps),
      exportFilenameInvalid: !settings.exportFilename,
      exportSpeedInvalid: !Number.isFinite(settings.exportSpeed),
      exportQualityInvalid: !Number.isFinite(settings.exportQuality),
    });
    if (
      !Number.isFinite(settings.sourceWidth) ||
      !Number.isFinite(settings.sourceHeight) ||
      !Array.isArray(settings.trimRange) ||
      settings.trimRange.length !== 2 ||
      !settings.crop ||
      !Number.isFinite(settings.exportFps) ||
      !settings.exportFilename ||
      !Number.isFinite(settings.exportSpeed) ||
      !Number.isFinite(settings.exportQuality)
    ) {
      return null;
    }
    return settings;
  } catch {
    return null;
  }
}

function updateProgress(job: TranscodeJob, line: string, duration: number) {
  const match = line.match(/^out_time_(?:us|ms)=(\d+)$/);
  if (!match) return;
  const processedSeconds = Number(match[1]) / 1_000_000;
  job.progress = Math.min(99, Math.max(0, (processedSeconds / duration) * 100));
}

async function readProgress(
  stream: ReadableStream<Uint8Array>,
  job: TranscodeJob,
  duration: number,
) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    pending += decoder.decode(value, { stream: true });
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() ?? "";
    for (const line of lines) updateProgress(job, line, duration);
  }
}

async function runTranscode(
  job: TranscodeJob,
  args: string[],
  temporaryPath: string,
  duration: number,
) {
  job.status = "processing";
  job.progress = 0;
  const process = Bun.spawn(["ffmpeg", ...args], {
    stdout: "ignore",
    stderr: "pipe",
  });
  try {
    await Promise.all([
      process.exited,
      readProgress(process.stderr, job, duration),
    ]);
    if ((await process.exited) === 0) {
      job.status = "completed";
      job.progress = 100;
    } else {
      job.status = "failed";
      job.error = "FFmpeg exited without completing the export.";
    }
  } catch (error) {
    job.status = "failed";
    job.error =
      error instanceof Error ? error.message : "FFmpeg failed to start.";
  }
}

app.post("/transcode", async (c) => {
  const form = await c.req.formData();
  const file = form.get("file");
  const settings = parseSettings(form.get("settings"));
  console.log(file, settings, form);

  if (!(file instanceof File) || !settings) {
    return c.json(
      { error: "A video file and valid export settings are required." },
      400,
    );
  }

  const format = settings.exportFormat;
  const jobId = crypto.randomUUID();
  const temporaryPath = path.join(
    os.tmpdir(),
    `${jobId}-${path.basename(file.name)}`,
  );
  await Bun.write(temporaryPath, file);
  await Bun.$`mkdir -p ${OUTPUT_DIRECTORY}`;

  const originalArgs = buildFFmpegArgs({
    inputPath: temporaryPath,
    filename: settings.exportFilename.trim() || file.name,
    sourceWidth: settings.sourceWidth,
    sourceHeight: settings.sourceHeight,
    trimRange: settings.trimRange,
    crop: settings.crop,
    format,
    fps: settings.exportFps,
    crf: settings.exportFormat === "mov" ? undefined : settings.exportQuality,
    customArgs: settings.customFFmpegArgs,
  });
  const originalOutputPath = originalArgs.at(-1)!;
  let alternateOutputPath: string | undefined;

  const job: TranscodeJob = {
    status: "processing",
    progress: 0,
    outputPath: originalOutputPath,
  };
  jobs.set(jobId, job);

  const runAll = async () => {
    job.status = "processing";
    job.progress = 0;
    await runTranscode(
      job,
      originalArgs,
      temporaryPath,
      Math.max(0.001, settings.trimRange[1] - settings.trimRange[0]),
    );

    if (settings.exportSpeed !== 1) {
      const suffix = `_${settings.exportSpeed.toFixed(1)}`;
      const speedArgs = buildFFmpegArgs({
        inputPath: temporaryPath,
        filename: settings.exportFilename.trim() || file.name,
        sourceWidth: settings.sourceWidth,
        sourceHeight: settings.sourceHeight,
        trimRange: settings.trimRange,
        crop: settings.crop,
        format,
        outputSuffix: suffix,
        speed: settings.exportSpeed,
        fps: settings.exportFps,
        crf:
          settings.exportFormat === "mov" ? undefined : settings.exportQuality,
        customArgs: settings.customFFmpegArgs,
      });
      alternateOutputPath = speedArgs.at(-1)!;
      job.alternateOutputPath = alternateOutputPath;
      await runTranscode(
        job,
        speedArgs,
        temporaryPath,
        Math.max(0.001, settings.trimRange[1] - settings.trimRange[0]),
      );
    }
  };

  void runAll();

  return c.json({ jobId, progressUrl: `/api/transcode/progress/${jobId}` });
});

app.get("/transcode/progress/:jobId", (c) => {
  const job = jobs.get(c.req.param("jobId"));
  if (!job) return c.json({ error: "Export job not found." }, 404);

  const encoder = new TextEncoder();
  let interval: ReturnType<typeof setInterval> | undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = () => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(job)}\n\n`));
        if (job.status !== "processing") {
          if (interval) clearInterval(interval);
          controller.close();
        }
      };
      send();
      interval = setInterval(send, 200);
    },
    cancel() {
      if (interval) clearInterval(interval);
    },
  });
  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream",
    },
  });
});

export default app;
