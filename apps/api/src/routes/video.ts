import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Hono } from "hono";
import { buildFFmpegArgs, OUTPUT_DIRECTORY } from "../utils/ffmpegBuilder.js";
import { buildCutFFmpegArgs, totalCutDuration } from "../utils/cutBuilder.js";
import { buildMobileSubtitlesArgs } from "../utils/mobileSubtitlesBuilder.js";
import { consumeUpload } from "./upload.js";

type JobStatus = "processing" | "completed" | "failed";

interface TranscodeSettings {
  sourceWidth: number;
  sourceHeight: number;
  trimRange: [number, number];
  ignoreTrim?: boolean;
  ignoreTrimSettings?: boolean;
  crop: { x: number; y: number; width: number; height: number };
  exportFormat: "mp4" | "webm" | "mov";
  exportFps: number;
  exportFilename: string;
  exportQuality: number;
  exportSpeed: number;
  customFFmpegArgs: string;
  watermark?: boolean;
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
  createdAt: number;
  proc?: ReturnType<typeof Bun.spawn>;
}

const app = new Hono();
const jobs = new Map<string, TranscodeJob>();

/** Absolute temp output path (os.tmpdir) — never relative, so ffmpeg's cwd can't matter. */
function tempOutputPath(jobId: string, suffix: string, ext: string): string {
  return path.join(os.tmpdir(), `temp_${jobId}${suffix}.${ext}`);
}

function cleanupJobFiles(job: TranscodeJob) {
  for (const p of [
    job.outputPath,
    job.alternateOutputPath,
    job.temporaryInputPath,
    ...(job.subtitlePaths ?? []),
  ].filter(Boolean) as string[]) {
    try {
      if (p.startsWith("/") || p.startsWith(os.tmpdir())) {
        try {
          fs.unlinkSync(p);
        } catch {
          try {
            Bun.file(p).delete();
          } catch {}
        }
      } else {
        try {
          fs.unlinkSync(p);
        } catch {
          try {
            Bun.file(p).delete();
          } catch {}
        }
      }
    } catch {}
  }
}

function killJob(job: TranscodeJob) {
  try {
    job.proc?.kill();
  } catch {}
  // SIGKILL fallback via Bun.spawnSync pkill? rely on proc.kill()
  try {
    // Force kill if still running
    if (job.proc && job.proc.exitCode === null) {
      job.proc.kill(9);
    }
  } catch {}
}

async function resolveInputFile(
  c: {
    req: {
      header: (n: string) => string | undefined;
      query: (n: string) => string | undefined;
    };
  },
  form: FormData,
): Promise<{
  temporaryPath: string;
  filename: string;
  isChunked: boolean;
} | null> {
  const headerId = c.req.header("x-upload-id");
  const queryId = c.req.query("uploadId");
  const fieldId = form.get("uploadId");
  const uploadId =
    headerId ??
    queryId ??
    (typeof fieldId === "string" ? fieldId.trim() : null);
  if (uploadId) {
    const p = consumeUpload(uploadId);
    if (!p) return null;
    try {
      fs.accessSync(p);
    } catch {
      return null;
    }
    const name = path.basename(p).replace(/^[0-9a-f-]{36}-/, "");
    return { temporaryPath: p, filename: name, isChunked: true };
  }
  const file = form.get("file");
  if (!(file instanceof File)) return null;
  const jobIdTmp = crypto.randomUUID();
  const tmp = path.join(os.tmpdir(), `${jobIdTmp}-${path.basename(file.name)}`);
  await Bun.write(tmp, file);
  return { temporaryPath: tmp, filename: file.name, isChunked: false };
}

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
  const proc = Bun.spawn(["ffmpeg", ...args], {
    stdout: "ignore",
    stderr: "pipe",
  });
  job.proc = proc;
  try {
    await Promise.all([
      proc.exited,
      readProgress(proc.stderr as ReadableStream<Uint8Array>, job, duration),
    ]);
    if ((await proc.exited) === 0) {
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
  } finally {
    job.proc = undefined;
  }
}

function parseMobileSettings(value: FormDataEntryValue | null):
  | (TranscodeSettings & {
      mobileLayout: NonNullable<TranscodeSettings["mobileLayout"]>;
    })
  | null {
  if (typeof value !== "string") return null;
  try {
    const s = JSON.parse(value) as TranscodeSettings & { watermark?: unknown };
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
    if (s.watermark !== undefined && typeof s.watermark !== "boolean")
      return null;
    if (s.ignoreTrim !== undefined && typeof s.ignoreTrim !== "boolean")
      return null;
    if (
      s.ignoreTrimSettings !== undefined &&
      typeof s.ignoreTrimSettings !== "boolean"
    )
      return null;
    // Normalize alias: frontend may send either key
    if (
      s.ignoreTrim === undefined &&
      typeof s.ignoreTrimSettings === "boolean"
    ) {
      s.ignoreTrim = s.ignoreTrimSettings;
    }
    return s as unknown as TranscodeSettings & {
      mobileLayout: NonNullable<TranscodeSettings["mobileLayout"]>;
    };
  } catch {
    return null;
  }
}

/**
 * Probe input duration via ffprobe (used for progress when trim is ignored
 * and the full-length video is rendered).
 */
async function probeMediaDuration(inputPath: string): Promise<number | null> {
  try {
    const proc = Bun.spawn(
      [
        "ffprobe",
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        inputPath,
      ],
      { stdout: "pipe", stderr: "ignore" },
    );
    const out = (await new Response(proc.stdout).text()).trim();
    await proc.exited;
    const d = Number(out);
    return Number.isFinite(d) && d > 0 ? d : null;
  } catch {
    return null;
  }
}

app.post("/transcode/mobile", async (c) => {
  let form: FormData;
  try {
    form = await c.req.formData();
  } catch (e) {
    console.error("[transcode/mobile] formData parse failed:", e);
    return c.json({ error: "Invalid multipart body" }, 400);
  }
  const settings = parseMobileSettings(form.get("settings"));
  if (!settings) {
    return c.json(
      {
        error:
          "A video file and valid mobileLayout export settings are required. Requires 16:9 source to 9:16 stacked/full with 1 or 2 zones.",
      },
      400,
    );
  }
  const resolved = await resolveInputFile(
    c as unknown as {
      req: {
        header: (n: string) => string | undefined;
        query: (n: string) => string | undefined;
      };
    },
    form,
  );
  if (!resolved)
    return c.json({ error: "A video file or uploadId is required." }, 400);
  const { temporaryPath, filename } = resolved;
  const format = "mp4" as const;
  const jobId = crypto.randomUUID();
  const originalOutputPath = tempOutputPath(jobId, "_mobile", format);
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
  const ignoreTrim = settings.ignoreTrim === true;
  let progressDuration = Math.max(
    0.001,
    settings.trimRange[1] - settings.trimRange[0],
  );
  if (ignoreTrim) {
    const probed = await probeMediaDuration(temporaryPath);
    if (probed) progressDuration = probed;
  }
  let originalArgs = buildFFmpegArgs({
    inputPath: temporaryPath,
    filename: settings.exportFilename.trim() || filename,
    sourceWidth: settings.sourceWidth,
    sourceHeight: settings.sourceHeight,
    trimRange: settings.trimRange,
    ignoreTrim,
    crop: { x: 0, y: 0, width: 100, height: 100 },
    format,
    fps: 60,
    crf: 10,
    customArgs: sanitizedCustomArgs,
    outputPath: originalOutputPath,
    mobileLayout: mobileLayout as never,
    speed: settings.exportSpeed,
    watermark: !!settings.watermark,
  });
  console.log("MOBILE ARGS", originalArgs);
  const job: TranscodeJob = {
    jobId,
    status: "processing",
    progress: 0,
    outputPath: originalOutputPath,
    alternateOutputPath: undefined,
    temporaryInputPath: temporaryPath,
    createdAt: Date.now(),
  };
  jobs.set(jobId, job);
  void (async () => {
    await runTranscode(job, originalArgs, temporaryPath, progressDuration);
  })();
  return c.json({
    jobId,
    progressUrl: `/api/transcode/progress/${jobId}`,
    output: { width: 1080, height: 1920 },
  });
});

app.post("/transcode/mobile/subtitles", async (c) => {
  let form: FormData;
  try {
    form = await c.req.formData();
  } catch (e) {
    console.error("[transcode/mobile/subtitles] formData parse failed:", e);
    return c.json({ error: "Invalid multipart body" }, 400);
  }
  const settings = parseMobileSettings(form.get("settings"));
  if (!settings) {
    return c.json(
      {
        error:
          "A video file and valid mobileLayout export settings are required for subtitles endpoint.",
      },
      400,
    );
  }
  const resolvedSubtitle = await resolveInputFile(
    c as unknown as {
      req: {
        header: (n: string) => string | undefined;
        query: (n: string) => string | undefined;
      };
    },
    form,
  );
  if (!resolvedSubtitle)
    return c.json(
      { error: "A video file or uploadId is required for subtitles endpoint." },
      400,
    );
  const { temporaryPath: subtitleTmp, filename: subtitleFilename } =
    resolvedSubtitle;
  // alias for below reuse — shadow outer file var already removed
  const file = { name: subtitleFilename } as File;

  // Parse subtitles metadata: front-end sends JSON array with startTime/endTime/x/y
  const rawSubtitles =
    form.get("subtitles") ??
    form.get("subtitlesMeta") ??
    form.get("subtitles_meta");
  let subtitlesMeta: Array<{
    startTime: number;
    endTime: number;
    x: number;
    y: number;
    width?: number;
    height?: number;
  }> = [];
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
            Number.isFinite(
              (s as Record<string, unknown>).startTime as number,
            ) &&
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
  const pngEntries = entries.filter(
    ([k, v]) => v instanceof File && k.startsWith("subtitle"),
  );
  if (pngEntries.length) {
    pngEntries.sort((a, b) => {
      const na = parseInt(a[0].replace(/\D/g, "") || "0", 10);
      const nb = parseInt(b[0].replace(/\D/g, "") || "0", 10);
      return na - nb;
    });
    for (const [, v] of pngEntries) subtitleFiles.push(v as File);
  } else {
    // fallback: any image file not the main file
    const fallback = entries.filter(
      ([k, v]) =>
        v instanceof File &&
        k !== "file" &&
        (v as File).type.startsWith("image/"),
    );
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
    if (
      s.endTime <= s.startTime ||
      s.startTime < trimStart - 0.001 ||
      s.endTime > trimEnd + 0.001
    ) {
      // clamp instead of reject? but reject if clearly outside
    }
    if (s.x < 0 || s.x > 100 || s.y < 0 || s.y > 100) {
      return c.json({ error: "Subtitle x/y must be 0-100" }, 400);
    }
  }

  const format = "mp4" as const;
  const jobId = crypto.randomUUID();
  const temporaryPath = subtitleTmp;

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

  const sanitizedCustomArgs = (settings.customFFmpegArgs || "")
    .replace(/(^|\s)-an(\s|$)/g, " ")
    .trim();
  const originalOutputPath = tempOutputPath(jobId, "_mobile_subtitles", format);

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
    createdAt: Date.now(),
  };
  jobs.set(jobId, job);
  void (async () => {
    await runTranscode(
      job,
      originalArgs,
      temporaryPath,
      Math.max(0.001, trimEnd - trimStart),
    );
    // keep subtitlePaths for cleanup on download
  })();
  return c.json({
    jobId,
    progressUrl: `/api/transcode/progress/${jobId}`,
    output: { width: 1080, height: 1920, subtitles: subtitlesMeta.length },
  });
});

function parseCutSettings(value: FormDataEntryValue | null): {
  mode: "full-size" | "2-stack" | "1-stack";
  cuts: Array<{ start: number; end: number }>;
  sourceWidth: number;
  sourceHeight: number;
  exportFilename: string;
  exportFps: number;
  exportQuality: number;
  exportSpeed: number;
  customFFmpegArgs: string;
  watermark?: boolean;
  splitRatio?: number;
  zones?: Array<{
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    zoom: number;
  }>;
} | null {
  if (typeof value !== "string") return null;
  try {
    const s = JSON.parse(value) as Record<string, unknown>;
    const mode = s.mode as string;
    if (!["full-size", "2-stack", "1-stack"].includes(mode)) return null;
    const cuts = s.cuts as Array<{ start: number; end: number }> | undefined;
    if (!Array.isArray(cuts) || cuts.length === 0 || cuts.length > 50)
      return null;
    const sorted = [...cuts].sort((a, b) => a.start - b.start);
    for (const cut of sorted) {
      if (
        typeof cut.start !== "number" ||
        typeof cut.end !== "number" ||
        !Number.isFinite(cut.start) ||
        !Number.isFinite(cut.end) ||
        cut.start < 0 ||
        cut.end <= cut.start + 0.049
      )
        return null;
    }
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].start < sorted[i - 1].end - 0.001) return null;
    }
    const sourceWidth = s.sourceWidth as number;
    const sourceHeight = s.sourceHeight as number;
    if (!Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight))
      return null;
    const exportFps = (s.exportFps as number) ?? 30;
    const exportQuality = (s.exportQuality as number) ?? 18;
    const exportSpeed = (s.exportSpeed as number) ?? 1;
    if (
      !Number.isFinite(exportFps) ||
      !Number.isFinite(exportQuality) ||
      !Number.isFinite(exportSpeed)
    )
      return null;
    const exportFilename =
      typeof s.exportFilename === "string" ? s.exportFilename : "";
    const customFFmpegArgs =
      typeof s.customFFmpegArgs === "string" ? s.customFFmpegArgs : "";
    if (s.watermark !== undefined && typeof s.watermark !== "boolean")
      return null;
    let splitRatio: number | undefined;
    if (mode === "2-stack") {
      const z = s.zones as unknown;
      if (!Array.isArray(z) || z.length !== 2) return null;
      for (const zone of z) {
        const zz = zone as Record<string, unknown>;
        if (
          typeof zz.x !== "number" ||
          typeof zz.y !== "number" ||
          typeof zz.width !== "number" ||
          typeof zz.height !== "number"
        )
          return null;
        // Accept 0-1 normalized or 0-100 percent
        const scale =
          (zz.width as number) > 1 || (zz.height as number) > 1 ? 100 : 1;
        const nx = (zz.x as number) / scale;
        const ny = (zz.y as number) / scale;
        const nw = (zz.width as number) / scale;
        const nh = (zz.height as number) / scale;
        if (
          nx < 0 ||
          ny < 0 ||
          nx + nw > 1.001 ||
          ny + nh > 1.001 ||
          nw < 0.02 ||
          nh < 0.02
        )
          return null;
      }
      splitRatio = s.splitRatio as number;
      if (
        typeof splitRatio !== "number" ||
        splitRatio < 0.2 ||
        splitRatio > 0.8
      )
        return null;
    } else if (mode === "1-stack") {
      const z = s.zones as unknown;
      if (!Array.isArray(z) || z.length !== 1) return null;
      const zz = (z as Array<Record<string, unknown>>)[0];
      if (
        typeof zz.x !== "number" ||
        typeof zz.y !== "number" ||
        typeof zz.width !== "number" ||
        typeof zz.height !== "number"
      )
        return null;
      const scale =
        (zz.width as number) > 1 || (zz.height as number) > 1 ? 100 : 1;
      const nx = (zz.x as number) / scale;
      const ny = (zz.y as number) / scale;
      const nw = (zz.width as number) / scale;
      const nh = (zz.height as number) / scale;
      if (
        nx < 0 ||
        ny < 0 ||
        nx + nw > 1.001 ||
        ny + nh > 1.001 ||
        nw < 0.02 ||
        nh < 0.02
      )
        return null;
    }
    return {
      mode: mode as "full-size" | "2-stack" | "1-stack",
      cuts: sorted,
      sourceWidth,
      sourceHeight,
      exportFilename,
      exportFps,
      exportQuality,
      exportSpeed,
      customFFmpegArgs,
      watermark:
        typeof s.watermark === "boolean" ? (s.watermark as boolean) : undefined,
      splitRatio,
      zones: (s.zones as never) ?? undefined,
    };
  } catch {
    return null;
  }
}

app.post("/transcode/cut", async (c) => {
  let form: FormData;
  try {
    form = await c.req.formData();
  } catch (e) {
    console.error("[transcode/cut] formData parse failed:", e);
    return c.json({ error: "Invalid multipart body" }, 400);
  }
  const settings = parseCutSettings(form.get("settings"));
  if (!settings) {
    return c.json(
      {
        error:
          "A video file and valid cut settings are required (mode + non-overlapping cuts + zones for stack modes).",
      },
      400,
    );
  }
  const resolved = await resolveInputFile(
    c as unknown as {
      req: {
        header: (n: string) => string | undefined;
        query: (n: string) => string | undefined;
      };
    },
    form,
  );
  if (!resolved)
    return c.json({ error: "A video file or uploadId is required." }, 400);
  const { temporaryPath, filename } = resolved;
  const jobId = crypto.randomUUID();
  const originalOutputPath = tempOutputPath(jobId, "_cut", "mp4");
  const totalDuration = Math.max(0.001, totalCutDuration(settings.cuts));
  const sanitizedCustomArgs = (settings.customFFmpegArgs || "")
    .replace(/(^|\s)-an(\s|$)/g, " ")
    .trim();
  const cutArgs = buildCutFFmpegArgs({
    inputPath: temporaryPath,
    filename: settings.exportFilename.trim() || filename,
    sourceWidth: settings.sourceWidth,
    sourceHeight: settings.sourceHeight,
    cuts: settings.cuts,
    mode: settings.mode,
    zones: (settings.zones as never) ?? null,
    splitRatio: settings.splitRatio,
    format: "mp4",
    fps: settings.exportFps,
    crf: settings.exportQuality,
    speed: settings.exportSpeed,
    customArgs: sanitizedCustomArgs,
    outputPath: originalOutputPath,
    watermark: !!settings.watermark,
  });
  console.log("CUT ARGS", cutArgs);
  const job: TranscodeJob = {
    jobId,
    status: "processing",
    progress: 0,
    outputPath: originalOutputPath,
    alternateOutputPath: undefined,
    temporaryInputPath: temporaryPath,
    createdAt: Date.now(),
  };
  jobs.set(jobId, job);
  void (async () => {
    await runTranscode(job, cutArgs, temporaryPath, totalDuration);
  })();
  const dims =
    settings.mode === "full-size"
      ? { width: settings.sourceWidth, height: settings.sourceHeight }
      : { width: 1080, height: 1920 };
  return c.json({
    jobId,
    progressUrl: `/api/transcode/progress/${jobId}`,
    output: { ...dims, cuts: settings.cuts.length, duration: totalDuration },
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
  let form: FormData;
  try {
    form = await c.req.formData();
  } catch (e) {
    console.error("[transcode] formData parse failed:", e);
    return c.json({ error: "Invalid multipart body" }, 400);
  }
  const settings = parseSettings(form.get("settings"));
  if (!settings) {
    return c.json(
      { error: "A video file and valid export settings are required." },
      400,
    );
  }
  const resolvedMain = await resolveInputFile(
    c as unknown as {
      req: {
        header: (n: string) => string | undefined;
        query: (n: string) => string | undefined;
      };
    },
    form,
  );
  if (!resolvedMain)
    return c.json({ error: "A video file or uploadId is required." }, 400);
  const { temporaryPath, filename } = resolvedMain;
  const file = { name: filename } as File;
  console.log(file, settings, form);

  const format = settings.exportFormat;
  const jobId = crypto.randomUUID();

  // Generate temp output paths in os.tmpdir()
  const originalOutputPath = tempOutputPath(jobId, "", format);
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
    filename: settings.exportFilename.trim() || filename,
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
    createdAt: Date.now(),
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
      alternateOutputPath = tempOutputPath(jobId, suffix, format);
      const speedArgs = buildFFmpegArgs({
        inputPath: temporaryPath,
        filename: settings.exportFilename.trim() || filename,
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
 * GET /transcode/jobs
 * List all jobs (for debugging / clearing pending).
 */
app.get("/transcode/jobs", (c) => {
  const list = Array.from(jobs.values()).map((j) => ({
    jobId: j.jobId,
    status: j.status,
    progress: j.progress,
    outputPath: j.outputPath,
    alternateOutputPath: j.alternateOutputPath,
    error: j.error,
    createdAt: j.createdAt,
    ageSeconds: Math.round((Date.now() - j.createdAt) / 1000),
  }));
  return c.json({ count: list.length, jobs: list });
});

/**
 * DELETE /transcode/jobs
 * Clear all jobs - kills hanging FFmpeg processes and deletes temp files.
 * Query param ?status=processing|pending filters to only those statuses.
 */
app.delete("/transcode/jobs", async (c) => {
  const filter = c.req.query("status");
  const shouldDelete = (j: TranscodeJob) => {
    if (!filter) return true;
    if (filter === "processing" || filter === "pending")
      return j.status === "processing";
    return j.status === filter;
  };
  let killed = 0;
  let deleted = 0;
  const ids: string[] = [];
  for (const [id, job] of Array.from(jobs.entries())) {
    if (!shouldDelete(job)) continue;
    if (job.status === "processing") {
      killJob(job);
      killed++;
    }
    cleanupJobFiles(job);
    jobs.delete(id);
    deleted++;
    ids.push(id);
  }
  // Also sweep stray temp files on disk (apps/api/temp_* and /tmp/*-*.mp4 matching job pattern)
  try {
    const { readdir, unlink } = await import("node:fs/promises");
    const apiDir = ".";
    try {
      const files = await readdir(apiDir);
      for (const f of files) {
        if (
          f.startsWith("temp_") &&
          (f.endsWith(".mp4") || f.endsWith(".webm") || f.endsWith(".mov"))
        ) {
          // only delete if corresponding job was deleted OR file older than 1h
          try {
            await unlink(path.join(apiDir, f));
          } catch {}
        }
      }
    } catch {}
    // cleanup /tmp job inputs + temp outputs - if clearing all, sweep all matching temps
    try {
      const tmpFiles = await readdir(os.tmpdir());
      for (const f of tmpFiles) {
        const isJobInput =
          /^[0-9a-f-]{36}-/.test(f) &&
          (f.endsWith(".mp4") ||
            f.endsWith(".png") ||
            f.endsWith(".webm") ||
            f.endsWith(".mov"));
        const isTempOutput =
          f.startsWith("temp_") &&
          (f.endsWith(".mp4") || f.endsWith(".webm") || f.endsWith(".mov"));
        if (isJobInput || isTempOutput) {
          const full = path.join(os.tmpdir(), f);
          const matchId = f.slice(0, 36);
          if (ids.includes(matchId) || !filter || filter === "all") {
            try {
              await unlink(full);
            } catch {}
          }
        }
      }
    } catch {}
  } catch {}
  return c.json({ cleared: deleted, killed, ids, filter: filter ?? "all" });
});

app.post("/transcode/clear", async (c) => {
  // alias for DELETE /transcode/jobs
  const body = (await c.req.json().catch(() => ({}))) as { status?: string };
  const filter = (c.req.query("status") as string) || body.status;
  let killed = 0;
  let deleted = 0;
  const ids: string[] = [];
  const shouldDelete = (j: TranscodeJob) => {
    if (!filter) return true;
    if (filter === "processing" || filter === "pending")
      return j.status === "processing";
    return j.status === filter;
  };
  for (const [id, job] of Array.from(jobs.entries())) {
    if (!shouldDelete(job)) continue;
    if (job.status === "processing") {
      killJob(job);
      killed++;
    }
    cleanupJobFiles(job);
    jobs.delete(id);
    deleted++;
    ids.push(id);
  }
  return c.json({ cleared: deleted, killed, ids, filter: filter ?? "all" });
});

app.delete("/transcode/jobs/:jobId", async (c) => {
  const id = c.req.param("jobId");
  const job = jobs.get(id);
  if (!job) return c.json({ error: "Job not found." }, 404);
  if (job.status === "processing") killJob(job);
  cleanupJobFiles(job);
  jobs.delete(id);
  return c.json({ deleted: id, status: job.status });
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
  // NOTE: read the file into memory BEFORE cleanup. The previous code
  // returned `new Response(file.stream())` with deletion in `finally`,
  // which deleted the file before Bun finished streaming it → ENOENT.
  const filePath = job.outputPath;
  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    return c.json({ error: "Output file not found." }, 404);
  }
  let bytes: ArrayBuffer;
  try {
    bytes = await file.arrayBuffer();
  } catch (e) {
    console.error("[transcode/download] failed reading output file:", e);
    return c.json({ error: "Output file could not be read." }, 500);
  }

  // Cleanup AFTER the bytes are safely in memory, then respond.
  const cleanupPaths = [
    job.outputPath,
    job.alternateOutputPath,
    job.temporaryInputPath,
    ...(job.subtitlePaths ?? []),
  ].filter(Boolean) as string[];
  for (const p of cleanupPaths) {
    try {
      fs.unlinkSync(p);
    } catch {
      try {
        await Bun.file(p).delete();
      } catch {
        // Ignore cleanup errors.
      }
    }
  }
  jobs.delete(c.req.param("jobId"));

  const isVideo = /\.(mp4|webm|mov)$/i.test(filePath);
  return new Response(bytes, {
    headers: {
      "Content-Type": isVideo ? "video/mp4" : "application/octet-stream",
      "Content-Disposition": `attachment; filename="${filePath.split("/").pop()}"`,
      "Cache-Control": "no-store",
    },
  });
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
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const startMs = Date.now();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = () => {
        try {
          // Avoid leaking Bun proc handle into JSON (strips proc)
          const { proc: _p, ...safe } = job as unknown as Record<
            string,
            unknown
          >;
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(safe)}\n\n`),
          );
        } catch {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ jobId: job.jobId, status: job.status, progress: job.progress })}\n\n`,
            ),
          );
        }
        if (job.status !== "processing") {
          if (interval) clearInterval(interval);
          if (timeout) clearTimeout(timeout);
          try {
            controller.close();
          } catch {}
        }
        // Hard cap 5min to avoid infinite SSE holding browser connection slots (6 per host)
        if (Date.now() - startMs > 5 * 60 * 1000) {
          if (interval) clearInterval(interval);
          if (timeout) clearTimeout(timeout);
          try {
            controller.close();
          } catch {}
        }
      };
      send();
      interval = setInterval(send, 200);
      // Safety timeout
      timeout = setTimeout(
        () => {
          if (interval) clearInterval(interval);
          try {
            controller.close();
          } catch {}
        },
        5 * 60 * 1000 + 1000,
      );
    },
    cancel() {
      if (interval) clearInterval(interval);
      if (timeout) clearTimeout(timeout);
    },
  });
  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream",
      "Access-Control-Allow-Origin": "*",
    },
  });
});

export default app;
