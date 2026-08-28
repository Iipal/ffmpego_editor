import os from "node:os";
import path from "node:path";
import { Hono } from "hono";
import { buildFFmpegArgs, OUTPUT_DIRECTORY } from "../utils/ffmpegBuilder.js";
import { buildMobileSubtitlesArgs } from "../utils/mobileSubtitlesBuilder.js";

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
  mobileLayout?: {
    mode: "full" | "stacked";
    splitRatio: number;
    zones: Array<{
      id: string;
      x: number;
      y: number;
      width: number;
      height: number;
      zoom: number;
    }>;
  } | null;
}

interface TranscodeJob {
  jobId: string;
  status: JobStatus;
  progress: number;
  outputPath: string;
  alternateOutputPath?: string;
  error?: string;
  temporaryInputPath: string;
  subtitlePaths?: string[];
}

const app = new Hono();
const jobs = new Map<string, TranscodeJob>();

/**
 * Parse and validate the JSON settings object from the form payload.
 *
 * This protects the exporter from malformed user input before building the
 * FFmpeg command.
 */
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
    const hasCrop = !!settings.crop;
    const hasMobile = !!settings.mobileLayout;
    if (
      !Number.isFinite(settings.sourceWidth) ||
      !Number.isFinite(settings.sourceHeight) ||
      !Array.isArray(settings.trimRange) ||
      settings.trimRange.length !== 2 ||
      (!hasCrop && !hasMobile) ||
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

/**
 * Convert FFmpeg progress lines into a normalized job progress percentage.
 *
 * FFmpeg reports progress as out_time_us or out_time_ms. The code converts the
 * reported position into seconds and compares it to the total trim duration.
 * Progress is capped at 99% while the process is still running to avoid
 * reporting premature completion.
 */
function updateProgress(job: TranscodeJob, line: string, duration: number) {
  const match = line.match(/^out_time_(?:us|ms)=(\d+)$/);
  if (!match) return;
  const processedSeconds = Number(match[1]) / 1_000_000;
  job.progress = Math.min(99, Math.max(0, (processedSeconds / duration) * 100));
}

/**
 * Stream FFmpeg stderr output and update the job progress in real time.
 */
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

/**
 * Spawn the FFmpeg process and wait until the export completes.
 *
 * This function updates the job record as the exporter runs, and marks the
 * status completed/failed at the end.
 */
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

function parseMobileSettings(value: FormDataEntryValue | null):
  | (TranscodeSettings & {
      mobileLayout: NonNullable<TranscodeSettings["mobileLayout"]>;
    })
  | null {
  if (typeof value !== "string") return null;
  try {
    const s = JSON.parse(value) as TranscodeSettings;
    if (
      !Number.isFinite(s.sourceWidth) ||
      !Number.isFinite(s.sourceHeight) ||
      !Array.isArray(s.trimRange) ||
      s.trimRange.length !== 2 ||
      !s.mobileLayout ||
      !["full", "stacked"].includes(s.mobileLayout.mode) ||
      typeof s.mobileLayout.splitRatio !== "number" ||
      s.mobileLayout.splitRatio < 0.2 ||
      s.mobileLayout.splitRatio > 0.8 ||
      !Array.isArray(s.mobileLayout.zones)
    )
      return null;
    const expected = s.mobileLayout.mode === "full" ? 1 : 2;
    if (s.mobileLayout.zones.length !== expected) return null;
    for (const z of s.mobileLayout.zones) {
      if (
        typeof z.x !== "number" ||
        typeof z.y !== "number" ||
        typeof z.width !== "number" ||
        typeof z.height !== "number" ||
        z.x < 0 ||
        z.y < 0 ||
        z.x + z.width > 1.001 ||
        z.y + z.height > 1.001 ||
        z.width < 0.02 ||
        z.height < 0.02
      )
        return null;
    }
    if (
      !Number.isFinite(s.exportFps) ||
      !s.exportFilename ||
      !Number.isFinite(s.exportSpeed) ||
      !Number.isFinite(s.exportQuality)
    )
      return null;
    return s as unknown as TranscodeSettings & {
      mobileLayout: NonNullable<TranscodeSettings["mobileLayout"]>;
    };
  } catch {
    return null;
  }
}

app.post("/transcode/mobile", async (c) => {
  const form = await c.req.formData();
  const file = form.get("file");
  const settings = parseMobileSettings(form.get("settings"));
  if (!(file instanceof File) || !settings) {
    return c.json(
      {
        error:
          "A video file and valid mobileLayout export settings are required. Requires 16:9 source to 9:16 stacked/full with 1 or 2 zones.",
      },
      400,
    );
  }
  const format = "mp4" as const;
  const jobId = crypto.randomUUID();
  const temporaryPath = path.join(
    os.tmpdir(),
    `${jobId}-${path.basename(file.name)}`,
  );
  await Bun.write(temporaryPath, file);
  const originalOutputPath = `./temp_${jobId}_mobile.${format}`;
  const mobileLayout = {
    mode: settings.mobileLayout.mode,
    splitRatio: settings.mobileLayout.splitRatio,
    zones: settings.mobileLayout.zones.map((z) => ({
      ...z,
      x: z.x * 100,
      y: z.y * 100,
      width: z.width * 100,
      height: z.height * 100,
    })),
  };
  const sanitizedCustomArgs = (settings.customFFmpegArgs || "")
    .replace(/(^|\s)-an(\s|$)/g, " ")
    .trim();
  const originalArgs = buildFFmpegArgs({
    inputPath: temporaryPath,
    filename: settings.exportFilename.trim() || file.name,
    sourceWidth: settings.sourceWidth,
    sourceHeight: settings.sourceHeight,
    trimRange: settings.trimRange,
    crop: { x: 0, y: 0, width: 100, height: 100 },
    format,
    fps: settings.exportFps,
    crf: 10,
    customArgs: sanitizedCustomArgs,
    outputPath: originalOutputPath,
    mobileLayout: mobileLayout as never,
    speed: settings.exportSpeed,
  });
  console.log("MOBILE ARGS", originalArgs);
  const job: TranscodeJob = {
    jobId,
    status: "processing",
    progress: 0,
    outputPath: originalOutputPath,
    alternateOutputPath: undefined,
    temporaryInputPath: temporaryPath,
  };
  jobs.set(jobId, job);
  void (async () => {
    await runTranscode(
      job,
      originalArgs,
      temporaryPath,
      Math.max(0.001, settings.trimRange[1] - settings.trimRange[0]),
    );
  })();
  return c.json({
    jobId,
    progressUrl: `/api/transcode/progress/${jobId}`,
    output: { width: 1080, height: 1920 },
  });
});

app.post("/transcode/mobile/subtitles", async (c) => {
  const form = await c.req.formData();
  const file = form.get("file");
  const settings = parseMobileSettings(form.get("settings"));
  if (!(file instanceof File) || !settings) {
    return c.json(
      {
        error:
          "A video file and valid mobileLayout export settings are required for subtitles endpoint.",
      },
      400,
    );
  }

  // Parse subtitles metadata: front-end sends JSON array with startTime/endTime/x/y
  const rawSubtitles = form.get("subtitles") ?? form.get("subtitlesMeta") ?? form.get("subtitles_meta");
  let subtitlesMeta: Array<{ startTime: number; endTime: number; x: number; y: number; width?: number; height?: number }> = [];
  if (typeof rawSubtitles === "string" && rawSubtitles.trim()) {
    try {
      const parsed = JSON.parse(rawSubtitles);
      if (Array.isArray(parsed)) {
        subtitlesMeta = parsed.filter(
          (s: unknown) =>
            typeof s === "object" &&
            s !== null &&
            typeof (s as Record<string, unknown>).startTime === "number" &&
            typeof (s as Record<string, unknown>).endTime === "number" &&
            typeof (s as Record<string, unknown>).x === "number" &&
            typeof (s as Record<string, unknown>).y === "number" &&
            Number.isFinite((s as Record<string, unknown>).startTime as number) &&
            Number.isFinite((s as Record<string, unknown>).endTime as number),
        ) as typeof subtitlesMeta;
      }
    } catch {
      return c.json({ error: "Invalid subtitles JSON" }, 400);
    }
  }

  // Collect PNG files: keys starting with subtitle_ or subtitle (excluding main file)
  const subtitleFiles: File[] = [];
  const entries: Array<[string, unknown]> = [];
  for (const [k, v] of form.entries()) {
    entries.push([k, v]);
  }
  // Prefer keys subtitle_0, subtitle_1 etc, sorted numerically
  const pngEntries = entries.filter(([k, v]) => v instanceof File && k.startsWith("subtitle"));
  if (pngEntries.length) {
    pngEntries.sort((a, b) => {
      const na = parseInt(a[0].replace(/\D/g, "") || "0", 10);
      const nb = parseInt(b[0].replace(/\D/g, "") || "0", 10);
      return na - nb;
    });
    for (const [, v] of pngEntries) subtitleFiles.push(v as File);
  } else {
    // fallback: any image file not the main file
    const fallback = entries.filter(([k, v]) => v instanceof File && k !== "file" && (v as File).type.startsWith("image/"));
    for (const [, v] of fallback) subtitleFiles.push(v as File);
  }

  if (subtitlesMeta.length !== subtitleFiles.length) {
    // Allow zero subtitles with zero files
    if (!(subtitlesMeta.length === 0 && subtitleFiles.length === 0)) {
      return c.json(
        {
          error: `Subtitles count mismatch: meta ${subtitlesMeta.length} vs files ${subtitleFiles.length}`,
        },
        400,
      );
    }
  }

  // Validate each meta clamped inside trim
  const [trimStart, trimEnd] = settings.trimRange;
  for (const s of subtitlesMeta) {
    if (s.endTime <= s.startTime || s.startTime < trimStart - 0.001 || s.endTime > trimEnd + 0.001) {
      // clamp instead of reject? but reject if clearly outside
    }
    if (s.x < 0 || s.x > 100 || s.y < 0 || s.y > 100) {
      return c.json({ error: "Subtitle x/y must be 0-100" }, 400);
    }
  }

  const format = "mp4" as const;
  const jobId = crypto.randomUUID();
  const temporaryPath = path.join(os.tmpdir(), `${jobId}-${path.basename(file.name)}`);
  await Bun.write(temporaryPath, file);

  const subtitlePngPaths: string[] = [];
  for (let i = 0; i < subtitleFiles.length; i++) {
    const f = subtitleFiles[i];
    const pngPath = path.join(os.tmpdir(), `${jobId}-sub${i}.png`);
    await Bun.write(pngPath, f);
    subtitlePngPaths.push(pngPath);
  }

  const subtitleOverlays = subtitlesMeta.map((m, i) => ({
    startTime: m.startTime,
    endTime: m.endTime,
    x: m.x,
    y: m.y,
    width: m.width ?? 0,
    height: m.height ?? 0,
    pngPath: subtitlePngPaths[i],
  }));

  const mobileLayout = {
    mode: settings.mobileLayout.mode,
    splitRatio: settings.mobileLayout.splitRatio,
    zones: settings.mobileLayout.zones.map((z) => ({
      ...z,
      x: z.x * 100,
      y: z.y * 100,
      width: z.width * 100,
      height: z.height * 100,
    })),
  };

  const sanitizedCustomArgs = (settings.customFFmpegArgs || "").replace(/(^|\s)-an(\s|$)/g, " ").trim();
  const originalOutputPath = `./temp_${jobId}_mobile_subtitles.${format}`;

  const originalArgs = buildMobileSubtitlesArgs({
    inputPath: temporaryPath,
    subtitleOverlays,
    subtitlePngPaths,
    sourceWidth: settings.sourceWidth,
    sourceHeight: settings.sourceHeight,
    trimRange: settings.trimRange,
    mobileLayout: mobileLayout as never,
    format,
    fps: settings.exportFps,
    crf: 10,
    customArgs: sanitizedCustomArgs,
    outputPath: originalOutputPath,
    filename: settings.exportFilename.trim() || file.name,
    speed: settings.exportSpeed,
  });

  console.log("MOBILE_SUBTITLES ARGS", originalArgs);

  const job: TranscodeJob = {
    jobId,
    status: "processing",
    progress: 0,
    outputPath: originalOutputPath,
    alternateOutputPath: undefined,
    temporaryInputPath: temporaryPath,
    subtitlePaths: subtitlePngPaths,
  };
  jobs.set(jobId, job);
  void (async () => {
    await runTranscode(job, originalArgs, temporaryPath, Math.max(0.001, trimEnd - trimStart));
    // keep subtitlePaths for cleanup on download
  })();
  return c.json({
    jobId,
    progressUrl: `/api/transcode/progress/${jobId}`,
    output: { width: 1080, height: 1920, subtitles: subtitlesMeta.length },
  });
});

/**
 * POST /transcode
 *
 * Accepts a video file and export settings, writes the file to a temp path,
 * and begins asynchronous export jobs for normal and optionally speed-adjusted
 * versions.
 */
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

  // Generate temp output paths: ./temp_${jobId}.${format}
  const originalOutputPath = `./temp_${jobId}.${format}`;
  let alternateOutputPath: string | undefined;

  const mobileLayout = settings.mobileLayout
    ? {
        mode: settings.mobileLayout.mode,
        splitRatio: settings.mobileLayout.splitRatio,
        zones: settings.mobileLayout.zones.map((z) => ({
          ...z,
          x: z.x * 100,
          y: z.y * 100,
          width: z.width * 100,
          height: z.height * 100,
        })),
      }
    : null;
  const originalArgs = buildFFmpegArgs({
    inputPath: temporaryPath,
    filename: settings.exportFilename.trim() || file.name,
    sourceWidth: settings.sourceWidth,
    sourceHeight: settings.sourceHeight,
    trimRange: settings.trimRange,
    crop: settings.crop ?? { x: 0, y: 0, width: 100, height: 100 },
    format,
    fps: settings.exportFps,
    crf: settings.exportFormat === "mov" ? undefined : settings.exportQuality,
    customArgs: settings.customFFmpegArgs,
    outputPath: originalOutputPath,
    mobileLayout: mobileLayout as never,
  });

  console.log("ARGS", originalArgs);

  const job: TranscodeJob = {
    jobId,
    status: "processing",
    progress: 0,
    outputPath: originalOutputPath,
    alternateOutputPath: undefined,
    temporaryInputPath: temporaryPath,
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
      alternateOutputPath = `./temp_${jobId}${suffix}.${format}`;
      const speedArgs = buildFFmpegArgs({
        inputPath: temporaryPath,
        filename: settings.exportFilename.trim() || file.name,
        sourceWidth: settings.sourceWidth,
        sourceHeight: settings.sourceHeight,
        trimRange: settings.trimRange,
        crop: settings.crop ?? { x: 0, y: 0, width: 100, height: 100 },
        format,
        outputSuffix: suffix,
        speed: settings.exportSpeed,
        fps: settings.exportFps,
        crf:
          settings.exportFormat === "mov" ? undefined : settings.exportQuality,
        customArgs: settings.customFFmpegArgs,
        outputPath: alternateOutputPath,
        mobileLayout: mobileLayout as never,
      });
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

/**
 * GET /transcode/download/:jobId
 *
 * Returns the rendered video file as a binary response so the frontend can
 * present a save dialog to the user. The file is deleted after it is served.
 */
app.get("/transcode/download/:jobId", async (c) => {
  const job = jobs.get(c.req.param("jobId"));
  if (!job || job.status !== "completed") {
    return c.json({ error: "Job not found or not completed." }, 404);
  }

  // Return the primary output file.
  let filePath = job.outputPath;
  try {
    const file = Bun.file(filePath);
    if (!(await file.exists())) {
      return c.json({ error: "Output file not found." }, 404);
    }
    const isMobile = filePath.includes("_mobile.");
    return new Response(file.stream(), {
      headers: {
        "Content-Type": isMobile ? "video/mp4" : "application/octet-stream",
        "Content-Disposition": `attachment; filename="${job.outputPath.split("/").pop()}"`,
        "Cache-Control": "no-store",
      },
    });
  } finally {
    // Delete the output file after serving so the user must re-download if needed.
    try {
      Bun.file(filePath).delete();
    } catch {
      // Ignore cleanup errors.
    }
    // Also clean up alternate output and temporary input.
    if (job.alternateOutputPath) {
      try {
        Bun.file(job.alternateOutputPath).delete();
      } catch {
        // Ignore.
      }
    }
    if (job.temporaryInputPath) {
      try {
        Bun.file(job.temporaryInputPath).delete();
      } catch {
        // Ignore.
      }
    }
    if (job.subtitlePaths) {
      for (const p of job.subtitlePaths) {
        try {
          Bun.file(p).delete();
        } catch {
          // Ignore.
        }
      }
    }
    jobs.delete(c.req.param("jobId"));
  }
});

/**
 * GET /transcode/progress/:jobId
 *
 * Returns an SSE stream of the current job record. The client will receive
 * updates every 200ms until the job completes.
 */
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
