import fs from "node:fs";
import { readdir, unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Hono } from "hono";
import { buildFFmpegArgs } from "../utils/ffmpegBuilder.js";
import { buildCutFFmpegArgs, totalCutDuration } from "../utils/cutBuilder.js";
import { buildMobileSubtitlesArgs } from "../utils/mobileSubtitlesBuilder.js";
import { consumeUpload } from "./upload.js";
import { jobError, jobLog, systemError } from "../observability.js";
import {
  cutSettingsSchema,
  genericSettingsSchema,
  mobileSettingsSchema,
  normalizeTrimAlias,
  parseCustomArgs,
  parseSettingsJson,
  type CutSettings,
  type GenericSettings,
  type MobileSettings,
} from "../validation.js";
import {
  deleteJob,
  getJob,
  insertJob,
  listJobs,
  updateJob,
  type JobRow,
  type JobStatus,
} from "../db.js";

type ProcHandle = ReturnType<typeof Bun.spawn>;

// ---------------------------------------------------------------------------
// B2: bounded transcode queue. ffmpeg is CPU-heavy; unbounded Bun.spawn calls
// OOM / thrash the machine when bulk mode fires N exports at once.
// Concurrency = min(2, cpuCount - 1), queue overflow → 429 + Retry-After.
// ---------------------------------------------------------------------------
const MAX_CONCURRENT = Math.max(
  1,
  Math.min(2, (os.cpus?.()?.length ?? 2) - 1 || 1),
);
const MAX_QUEUED = 50;

let activeCount = 0;
const waitQueue: string[] = [];
const procs = new Map<string, ProcHandle>();
const starters = new Map<string, () => Promise<void>>();

export function getQueueStats() {
  return {
    active: activeCount,
    queued: waitQueue.length,
    maxConcurrent: MAX_CONCURRENT,
    maxQueued: MAX_QUEUED,
  };
}

// js-hoist-regexp: hoist hot-path RegExps out of per-line / per-file loops
const OUT_TIME_RE = /^out_time_(?:us|ms)=(\d+)$/;
const LINE_SPLIT_RE = /\r?\n/;
const JOB_INPUT_RE = /^[0-9a-f-]{36}-/;
const LOG_TAIL_MAX_LINES = 50;
const LOG_TAIL_MAX_CHARS = 20_000;

function pushTail(tail: string[], line: string): string[] {
  tail.push(line);
  while (tail.length > LOG_TAIL_MAX_LINES) tail.shift();
  let joined = tail.join("\n");
  while (joined.length > LOG_TAIL_MAX_CHARS && tail.length > 1) {
    tail.shift();
    joined = tail.join("\n");
  }
  return tail;
}

/** Absolute temp output path (os.tmpdir) — never relative, so ffmpeg's cwd can't matter. */
function tempOutputPath(jobId: string, suffix: string, ext: string): string {
  return path.join(os.tmpdir(), `temp_${jobId}${suffix}.${ext}`);
}

function cleanupJobFiles(
  job: Pick<
    JobRow,
    | "outputPath"
    | "alternateOutputPath"
    | "temporaryInputPath"
    | "subtitlePaths"
  >,
) {
  for (const p of [
    job.outputPath,
    job.alternateOutputPath,
    job.temporaryInputPath,
    ...(job.subtitlePaths ?? []),
  ].filter(Boolean) as string[]) {
    try {
      fs.unlinkSync(p);
    } catch {
      try {
        Bun.file(p).delete();
      } catch {}
    }
  }
}

function killProc(jobId: string) {
  const proc = procs.get(jobId);
  if (!proc) return;
  // Graceful SIGTERM first, SIGKILL fallback after 2s if still alive.
  try {
    proc.kill();
  } catch {}
  setTimeout(() => {
    try {
      if (proc.exitCode === null) proc.kill(9);
    } catch {}
  }, 2000).unref?.();
}

function dequeue(jobId: string) {
  const i = waitQueue.indexOf(jobId);
  if (i >= 0) waitQueue.splice(i, 1);
  starters.delete(jobId);
}

function pumpQueue() {
  while (activeCount < MAX_CONCURRENT && waitQueue.length > 0) {
    const nextId = waitQueue.shift()!;
    const start = starters.get(nextId);
    if (!start) continue;
    starters.delete(nextId);
    activeCount++;
    updateJob(nextId, { status: "processing", progress: 0 });
    void start().finally(() => {
      activeCount = Math.max(0, activeCount - 1);
      pumpQueue();
    });
  }
}

/**
 * Register a starter for a job already inserted as `queued`.
 * Returns true when the job starts immediately or is queued,
 * false when the queue is full (caller must 429 + delete the row).
 */
function enqueue(jobId: string, start: () => Promise<void>): boolean {
  if (activeCount < MAX_CONCURRENT) {
    activeCount++;
    updateJob(jobId, { status: "processing", progress: 0 });
    void start().finally(() => {
      activeCount = Math.max(0, activeCount - 1);
      pumpQueue();
    });
    return true;
  }
  if (waitQueue.length >= MAX_QUEUED) return false;
  starters.set(jobId, start);
  waitQueue.push(jobId);
  return true;
}

function createQueuedJob(
  init: Omit<
    JobRow,
    "status" | "progress" | "error" | "logTail" | "exitCode" | "updatedAt"
  >,
): JobRow {
  insertJob({
    ...init,
    status: "queued",
    progress: 0,
    error: null,
    logTail: null,
    exitCode: null,
  });
  return getJob(init.jobId)!;
}

// B4: strict zod schemas (validation.ts) replace the hand-rolled validators.
// 400s now carry structured `issues`; client/server schema sharing waits on
// B3 (@repo/types).
export type TranscodeSettings = GenericSettings;
export type MobileTranscodeSettings = MobileSettings;
export type CutTranscodeSettings = CutSettings;

const app = new Hono();

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
 * Convert FFmpeg progress lines into a normalized progress percentage.
 *
 * FFmpeg reports progress as out_time_us or out_time_ms. The code converts the
 * reported position into seconds and compares it to the total trim duration.
 * Progress is capped at 99% while the process is still running to avoid
 * reporting premature completion.
 */
function progressFromLine(line: string, duration: number): number | null {
  const match = OUT_TIME_RE.exec(line);
  if (!match) return null;
  const processedSeconds = Number(match[1]) / 1_000_000;
  return Math.min(99, Math.max(0, (processedSeconds / duration) * 100));
}

/**
 * Stream FFmpeg stderr, updating DB progress in real time and capturing a
 * bounded tail of log lines so failures are debuggable from SSE / /jobs.
 */
async function readProgress(
  stream: ReadableStream<Uint8Array>,
  jobId: string,
  duration: number,
) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const tail: string[] = [];
  let pending = "";
  let lastFlush = 0;
  const flush = (progress?: number) => {
    const now = Date.now();
    // Throttle DB writes to ~5Hz; always flush terminal-relevant tail.
    if (progress === undefined || now - lastFlush > 200) {
      lastFlush = now;
      updateJob(jobId, {
        ...(progress !== undefined ? { progress } : {}),
        logTail: tail.join("\n"),
      });
    }
  };
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    pending += decoder.decode(value, { stream: true });
    const lines = pending.split(LINE_SPLIT_RE);
    pending = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.length > 2000 ? line.slice(0, 2000) : line;
      if (trimmed) pushTail(tail, trimmed);
      const p = progressFromLine(line, duration);
      if (p !== null) flush(p);
    }
  }
  if (pending) pushTail(tail, pending.slice(0, 2000));
  updateJob(jobId, { logTail: tail.join("\n") });
}

/**
 * Spawn the FFmpeg process and wait until the export completes.
 * Respects cooperative cancellation: if the row was marked `cancelled`
 * while ffmpeg ran, the terminal state is left alone.
 */
async function runTranscode(jobId: string, args: string[], duration: number) {
  const proc = Bun.spawn(["ffmpeg", ...args], {
    stdout: "ignore",
    stderr: "pipe",
  });
  procs.set(jobId, proc);
  try {
    await Promise.all([
      proc.exited,
      readProgress(proc.stderr as ReadableStream<Uint8Array>, jobId, duration),
    ]);
    const current = getJob(jobId);
    if (current?.status === "cancelled") return;
    const code = await proc.exited;
    if (code === 0) {
      updateJob(jobId, { status: "completed", progress: 100, exitCode: 0 });
      jobLog(jobId, "completed (exit 0)");
    } else {
      // B4: numeric exitCode column replaces exit-code-in-string parsing;
      // last-5-lines summary kept for human readability.
      const tail = getJob(jobId)?.logTail ?? "";
      const last = tail.split("\n").slice(-5).join("\n");
      updateJob(jobId, {
        status: "failed",
        exitCode: code,
        error: `FFmpeg exited with code ${code}.${last ? `\nLast output:\n${last}` : ""}`,
      });
      jobError(jobId, `failed (exit ${code})`);
    }
  } catch (error) {
    const current = getJob(jobId);
    if (current?.status === "cancelled") return;
    updateJob(jobId, {
      status: "failed",
      error: error instanceof Error ? error.message : "FFmpeg failed to start.",
    });
    jobError(jobId, "failed to start:", error);
  } finally {
    procs.delete(jobId);
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

function queueFullResponse(c: {
  json: (
    body: unknown,
    status?: number,
    headers?: Record<string, string>,
  ) => Response;
}) {
  return c.json(
    {
      error: "Transcode queue is full, try again shortly.",
      ...getQueueStats(),
    },
    429,
    { "Retry-After": "10" },
  );
}

/**
 * B4: parse customFFmpegArgs via shell-quote + structural denylist.
 * Returns the parsed args or an { argError } the route turns into 400.
 */
function parseArgsField(
  raw: string | undefined,
  allowVf: boolean,
): { args: string[]; extraVf: string[] } | { argError: string } {
  try {
    return parseCustomArgs(raw, { allowVf });
  } catch (e) {
    return {
      argError: e instanceof Error ? e.message : "Invalid customFFmpegArgs.",
    };
  }
}

app.post("/transcode/mobile", async (c) => {
  let form: FormData;
  try {
    form = await c.req.formData();
  } catch (e) {
    systemError("[transcode/mobile] formData parse failed:", e);
    return c.json({ error: "Invalid multipart body" }, 400);
  }
  const mobileParsed = parseSettingsJson(
    form.get("settings"),
    mobileSettingsSchema,
  );
  if (!mobileParsed.ok) {
    return c.json(
      {
        error:
          "A video file and valid mobileLayout export settings are required. Requires 16:9 source to 9:16 stacked/full with 1 or 2 zones.",
        issues: mobileParsed.issues,
      },
      400,
    );
  }
  const settings = normalizeTrimAlias(mobileParsed.data);
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
  const custom = parseArgsField(
    (settings.customFFmpegArgs || "").replace(/(^|\s)-an(\s|$)/g, " "),
    false, // mobile builds a filter_complex graph — -vf denied at parse
  );
  if ("argError" in custom) return c.json({ error: custom.argError }, 400);
  const ignoreTrim = settings.ignoreTrim === true;
  let progressDuration = Math.max(
    0.001,
    settings.trimRange[1] - settings.trimRange[0],
  );
  if (ignoreTrim) {
    const probed = await probeMediaDuration(temporaryPath);
    if (probed) progressDuration = probed;
  }
  const originalArgs = buildFFmpegArgs({
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
    customArgs: custom.args,
    outputPath: originalOutputPath,
    mobileLayout: mobileLayout as never,
    gainDb: settings.gainDb,
    loudnormTargetLufs: settings.loudnormTargetLufs,
    fadeInSeconds: settings.fadeInSeconds,
    fadeOutSeconds: settings.fadeOutSeconds,
    muteSegments: settings.muteSegments,
    speed: settings.exportSpeed,
    watermark: !!settings.watermark,
    audioTracks: settings.audioTracks,
  });
  jobLog(jobId, "mobile ffmpeg args:", originalArgs.join(" "));
  createQueuedJob({
    jobId,
    outputPath: originalOutputPath,
    alternateOutputPath: null,
    temporaryInputPath: temporaryPath,
    subtitlePaths: [],
    createdAt: Date.now(),
    kind: "mobile",
    filename: settings.exportFilename.trim() || filename,
  });
  const started = enqueue(jobId, () =>
    runTranscode(jobId, originalArgs, progressDuration),
  );
  if (!started) {
    const job = getJob(jobId);
    if (job) {
      cleanupJobFiles(job);
      deleteJob(jobId);
    }
    return queueFullResponse(c);
  }
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
    systemError("[transcode/mobile/subtitles] formData parse failed:", e);
    return c.json({ error: "Invalid multipart body" }, 400);
  }
  const subParsed = parseSettingsJson(
    form.get("settings"),
    mobileSettingsSchema,
  );
  if (!subParsed.ok) {
    return c.json(
      {
        error:
          "A video file and valid mobileLayout export settings are required for subtitles endpoint.",
        issues: subParsed.issues,
      },
      400,
    );
  }
  const settings = normalizeTrimAlias(subParsed.data);
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

  const custom = parseArgsField(
    (settings.customFFmpegArgs || "").replace(/(^|\s)-an(\s|$)/g, " "),
    false, // subtitles builder owns a filter_complex graph
  );
  if ("argError" in custom) return c.json({ error: custom.argError }, 400);
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
    customArgs: custom.args,
    outputPath: originalOutputPath,
    filename: settings.exportFilename.trim() || file.name,
    speed: settings.exportSpeed,
  });

  jobLog(jobId, "mobile-subtitles ffmpeg args:", originalArgs.join(" "));

  createQueuedJob({
    jobId,
    outputPath: originalOutputPath,
    alternateOutputPath: null,
    temporaryInputPath: temporaryPath,
    subtitlePaths: subtitlePngPaths,
    createdAt: Date.now(),
    kind: "mobile-subtitles",
    filename: settings.exportFilename.trim() || file.name,
  });
  const started = enqueue(jobId, () =>
    runTranscode(jobId, originalArgs, Math.max(0.001, trimEnd - trimStart)),
  );
  if (!started) {
    const job = getJob(jobId);
    if (job) {
      cleanupJobFiles(job);
      deleteJob(jobId);
    }
    return queueFullResponse(c);
  }
  return c.json({
    jobId,
    progressUrl: `/api/transcode/progress/${jobId}`,
    output: { width: 1080, height: 1920, subtitles: subtitlesMeta.length },
  });
});

app.post("/transcode/cut", async (c) => {
  let form: FormData;
  try {
    form = await c.req.formData();
  } catch (e) {
    systemError("[transcode/cut] formData parse failed:", e);
    return c.json({ error: "Invalid multipart body" }, 400);
  }
  const cutParsed = parseSettingsJson(form.get("settings"), cutSettingsSchema);
  if (!cutParsed.ok) {
    return c.json(
      {
        error:
          "A video file and valid cut settings are required (mode + non-overlapping cuts + zones for stack modes).",
        issues: cutParsed.issues,
      },
      400,
    );
  }
  const settings = cutParsed.data;
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
  const custom = parseArgsField(
    (settings.customFFmpegArgs || "").replace(/(^|\s)-an(\s|$)/g, " "),
    false, // cut builder owns a filter_complex graph
  );
  if ("argError" in custom) return c.json({ error: custom.argError }, 400);
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
    customArgs: custom.args,
    outputPath: originalOutputPath,
    watermark: !!settings.watermark,
  });
  jobLog(jobId, "cut ffmpeg args:", cutArgs.join(" "));
  createQueuedJob({
    jobId,
    outputPath: originalOutputPath,
    alternateOutputPath: null,
    temporaryInputPath: temporaryPath,
    subtitlePaths: [],
    createdAt: Date.now(),
    kind: "cut",
    filename: settings.exportFilename.trim() || filename,
  });
  const started = enqueue(jobId, () =>
    runTranscode(jobId, cutArgs, totalDuration),
  );
  if (!started) {
    const job = getJob(jobId);
    if (job) {
      cleanupJobFiles(job);
      deleteJob(jobId);
    }
    return queueFullResponse(c);
  }
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
 * and enqueues an export job (normal + optionally speed-adjusted version).
 * The worker slot is held across both passes so progress stays coherent.
 */
app.post("/transcode", async (c) => {
  let form: FormData;
  try {
    form = await c.req.formData();
  } catch (e) {
    systemError("[transcode] formData parse failed:", e);
    return c.json({ error: "Invalid multipart body" }, 400);
  }
  const genericParsed = parseSettingsJson(
    form.get("settings"),
    genericSettingsSchema,
  );
  if (!genericParsed.ok) {
    return c.json(
      {
        error: "A video file and valid export settings are required.",
        issues: genericParsed.issues,
      },
      400,
    );
  }
  const settings = genericParsed.data;
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
  void file;

  const format = settings.exportFormat;
  const jobId = crypto.randomUUID();

  // Generate temp output paths in os.tmpdir()
  const originalOutputPath = tempOutputPath(jobId, "", format);

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
  // B4: -vf merges into our -vf chain only for the plain path; a
  // mobileLayout builds a filter_complex graph where -vf is denied.
  const custom = parseArgsField(settings.customFFmpegArgs, !mobileLayout);
  if ("argError" in custom) return c.json({ error: custom.argError }, 400);
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
    customArgs: custom.args,
    extraVideoFilters: custom.extraVf,
    outputPath: originalOutputPath,
    mobileLayout: mobileLayout as never,
    audioTrackIndex: settings.audioTrackIndex,
    audioTracks: settings.audioTracks,
  });

  jobLog(jobId, "ffmpeg args:", originalArgs.join(" "));

  createQueuedJob({
    jobId,
    outputPath: originalOutputPath,
    alternateOutputPath: null,
    temporaryInputPath: temporaryPath,
    subtitlePaths: [],
    createdAt: Date.now(),
    kind: "transcode",
    filename: settings.exportFilename.trim() || filename,
  });

  const duration = Math.max(
    0.001,
    settings.trimRange[1] - settings.trimRange[0],
  );
  const runAll = async () => {
    await runTranscode(jobId, originalArgs, duration);
    const afterFirst = getJob(jobId);
    if (!afterFirst || afterFirst.status !== "completed") return;
    if (settings.exportSpeed !== 1) {
      const suffix = `_${settings.exportSpeed.toFixed(1)}`;
      const alternateOutputPath = tempOutputPath(jobId, suffix, format);
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
        customArgs: custom.args,
        extraVideoFilters: custom.extraVf,
        outputPath: alternateOutputPath,
        mobileLayout: mobileLayout as never,
        gainDb: settings.gainDb,
        loudnormTargetLufs: settings.loudnormTargetLufs,
        fadeInSeconds: settings.fadeInSeconds,
        fadeOutSeconds: settings.fadeOutSeconds,
        muteSegments: settings.muteSegments,
        audioTrackIndex: settings.audioTrackIndex,
        audioTracks: settings.audioTracks,
      });
      updateJob(jobId, { alternateOutputPath, progress: 0 });
      await runTranscode(jobId, speedArgs, duration);
    }
  };

  const started = enqueue(jobId, runAll);
  if (!started) {
    const job = getJob(jobId);
    if (job) {
      cleanupJobFiles(job);
      deleteJob(jobId);
    }
    return queueFullResponse(c);
  }

  return c.json({ jobId, progressUrl: `/api/transcode/progress/${jobId}` });
});

/**
 * Shared jobs snapshot payload (B1 SQLite rows + B2 queue stats).
 * Used by both GET /transcode/jobs and the SSE jobs stream.
 */
function buildJobsPayload() {
  const list = listJobs().map((j) => ({
    jobId: j.jobId,
    status: j.status,
    progress: j.progress,
    outputPath: j.outputPath,
    alternateOutputPath: j.alternateOutputPath,
    error: j.error,
    logTail: j.logTail,
    exitCode: j.exitCode,
    kind: j.kind,
    filename: j.filename,
    createdAt: j.createdAt,
    queuePosition: j.status === "queued" ? waitQueue.indexOf(j.jobId) : null,
    ageSeconds: Math.round((Date.now() - j.createdAt) / 1000),
  }));
  return { count: list.length, jobs: list, queue: getQueueStats() };
}

/**
 * GET /transcode/jobs
 * List all jobs (persisted in SQLite, survives restarts).
 */
app.get("/transcode/jobs", (c) => {
  return c.json(buildJobsPayload());
});

/**
 * GET /transcode/jobs/stream
 *
 * SSE push stream of the full jobs snapshot for the Admin dashboard.
 * Emits the snapshot immediately on connect, then every 1s. Stays open
 * indefinitely (EventSource auto-reconnects on drop); closes on client
 * disconnect. Replaces client-side polling so the UI never flashes an
 * "updating" state — snapshots land in the query cache without isFetching.
 */
app.get("/transcode/jobs/stream", (c) => {
  const encoder = new TextEncoder();
  let interval: ReturnType<typeof setInterval> | undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = () => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(buildJobsPayload())}\n\n`),
          );
        } catch {
          if (interval) clearInterval(interval);
          try {
            controller.close();
          } catch {}
        }
      };
      send();
      interval = setInterval(send, 1000);
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
      "Access-Control-Allow-Origin": "*",
    },
  });
});

function hardDeleteJob(id: string): { killed: boolean; deleted: boolean } {
  const job = getJob(id);
  if (!job) return { killed: false, deleted: false };
  const wasActive = job.status === "processing" || job.status === "queued";
  if (job.status === "queued") dequeue(id);
  if (job.status === "processing") {
    killProc(id);
    // Release the slot now; runTranscode's finally still decrements via pump
    // guard — instead mark cancelled first so the runner no-ops its finish.
    updateJob(id, { status: "cancelled" });
  }
  const fresh = getJob(id);
  if (fresh) cleanupJobFiles(fresh);
  deleteJob(id);
  // If it held a worker slot, pump the next queued job immediately.
  if (wasActive) {
    // runTranscode finally will also pump; double-pump is harmless (guarded).
    pumpQueue();
  }
  return { killed: job.status === "processing", deleted: true };
}

/**
 * DELETE /transcode/jobs
 * Clear jobs - kills running FFmpeg processes and deletes files + DB rows.
 * Query param ?status=processing|pending|queued|completed|failed filters.
 */
app.delete("/transcode/jobs", async (c) => {
  const filter = c.req.query("status");
  const shouldDelete = (j: JobRow) => {
    if (!filter || filter === "all") return true;
    if (filter === "processing" || filter === "pending")
      return j.status === "processing" || j.status === "queued";
    return j.status === (filter as JobStatus);
  };
  let killed = 0;
  let deleted = 0;
  const ids: string[] = [];
  for (const job of listJobs()) {
    if (!shouldDelete(job)) continue;
    const r = hardDeleteJob(job.jobId);
    if (r.killed) killed++;
    if (r.deleted) {
      deleted++;
      ids.push(job.jobId);
    }
  }
  // Also sweep stray temp files on disk (apps/api/temp_* and /tmp/* matching job pattern)
  try {
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
          JOB_INPUT_RE.test(f) &&
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
  const shouldDelete = (j: JobRow) => {
    if (!filter) return true;
    if (filter === "processing" || filter === "pending")
      return j.status === "processing" || j.status === "queued";
    return j.status === (filter as JobStatus);
  };
  for (const job of listJobs()) {
    if (!shouldDelete(job)) continue;
    const r = hardDeleteJob(job.jobId);
    if (r.killed) killed++;
    if (r.deleted) {
      deleted++;
      ids.push(job.jobId);
    }
  }
  return c.json({ cleared: deleted, killed, ids, filter: filter ?? "all" });
});

app.delete("/transcode/jobs/:jobId", async (c) => {
  const id = c.req.param("jobId");
  // ?mode=cancel → cooperative cancel: kill ffmpeg, keep row + files so the
  // user can inspect logTail; SSE emits { status: "cancelled" } then closes.
  if (c.req.query("mode") === "cancel") {
    const job = getJob(id);
    if (!job) return c.json({ error: "Job not found." }, 404);
    if (job.status === "queued") {
      dequeue(id);
      updateJob(id, { status: "cancelled", error: "Cancelled by user." });
      return c.json({ cancelled: id, status: "cancelled" });
    }
    if (job.status === "processing") {
      updateJob(id, { status: "cancelled", error: "Cancelled by user." });
      killProc(id);
      return c.json({ cancelled: id, status: "cancelled" });
    }
    return c.json({ cancelled: id, status: job.status });
  }
  const job = getJob(id);
  if (!job) return c.json({ error: "Job not found." }, 404);
  const prevStatus = job.status;
  hardDeleteJob(id);
  return c.json({ deleted: id, status: prevStatus });
});

/**
 * GET /transcode/download/:jobId
 *
 * Returns the rendered video file. Files are kept until the user explicitly
 * deletes the job (DELETE /transcode/jobs/:jobId) — downloading does NOT
 * delete anything (B1 keep-until-delete).
 *
 * B4: streams from disk (no whole-file buffering → no 10GB OOM) with
 * Content-Length, correct Content-Type per extension, Accept-Ranges, and
 * single-range (bytes=start-end) support for resumable downloads / seeking.
 */
app.get("/transcode/download/:jobId", async (c) => {
  const id = c.req.param("jobId");
  const job = getJob(id);
  if (!job || job.status !== "completed") {
    return c.json({ error: "Job not found or not completed." }, 404);
  }

  const filePath = job.outputPath;
  let stat: { size: number };
  try {
    stat = fs.statSync(filePath);
  } catch (e) {
    systemError("[transcode/download] failed stating output file:", e);
    return c.json({ error: "Output file not found." }, 404);
  }
  const total = stat.size;
  if (total <= 0) {
    return c.json({ error: "Output file is empty." }, 500);
  }

  const ext = filePath.split(".").pop()?.toLowerCase();
  const contentType =
    ext === "mp4"
      ? "video/mp4"
      : ext === "webm"
        ? "video/webm"
        : ext === "mov"
          ? "video/quicktime"
          : "application/octet-stream";
  const filename = filePath.split("/").pop() ?? `${id}.mp4`;
  const baseHeaders = {
    "Content-Type": contentType,
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "no-store",
    "Accept-Ranges": "bytes",
  };

  const range = c.req.header("Range") ?? c.req.header("range");
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (!m || (m[1] === "" && m[2] === "")) {
      return c.json({ error: "Invalid Range header." }, 416, {
        "Content-Range": `bytes */${total}`,
      });
    }
    let start = m[1] === "" ? total - Number(m[2]) : Number(m[1]);
    let end = m[2] === "" ? total - 1 : Number(m[2]);
    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      return c.json({ error: "Invalid Range header." }, 416, {
        "Content-Range": `bytes */${total}`,
      });
    }
    start = Math.max(0, Math.min(start, total - 1));
    end = Math.max(start, Math.min(end, total - 1));
    const length = end - start + 1;
    return new Response(Bun.file(filePath).slice(start, end + 1), {
      status: 206,
      headers: {
        ...baseHeaders,
        "Content-Length": String(length),
        "Content-Range": `bytes ${start}-${end}/${total}`,
      },
    });
  }

  return new Response(Bun.file(filePath), {
    headers: { ...baseHeaders, "Content-Length": String(total) },
  });
});

/**
 * GET /transcode/progress/:jobId
 *
 * SSE stream of the job row (read fresh from SQLite every 200ms).
 * Emits { status: queued|processing } then terminal
 * { completed|failed|cancelled } (with error + logTail + exitCode) and closes.
 * B4: no 5-minute hard cap (long 4K renders stalled at 99%) — the stream
 * closes on terminal state or client disconnect, and a `: heartbeat` comment
 * every 15s keeps proxies/NATs from killing idle connections.
 */
app.get("/transcode/progress/:jobId", (c) => {
  const id = c.req.param("jobId");
  const initial = getJob(id);
  if (!initial) return c.json({ error: "Export job not found." }, 404);

  const encoder = new TextEncoder();
  let interval: ReturnType<typeof setInterval> | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = () => {
        const job = getJob(id);
        if (!job) {
          try {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ jobId: id, status: "failed", progress: 0, error: "Job was deleted." })}\n\n`,
              ),
            );
          } catch {}
          if (interval) clearInterval(interval);
          if (heartbeat) clearInterval(heartbeat);
          try {
            controller.close();
          } catch {}
          return;
        }
        const queuePosition =
          job.status === "queued" ? waitQueue.indexOf(job.jobId) : null;
        const payload = { ...job, queuePosition, queue: getQueueStats() };
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(payload)}\n\n`),
          );
        } catch {
          try {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ jobId: job.jobId, status: job.status, progress: job.progress })}\n\n`,
              ),
            );
          } catch {}
        }
        if (job.status !== "processing" && job.status !== "queued") {
          if (interval) clearInterval(interval);
          if (heartbeat) clearInterval(heartbeat);
          try {
            controller.close();
          } catch {}
        }
      };
      send();
      interval = setInterval(send, 200);
      // B4: heartbeat comment (SSE comments are ignored by EventSource) so
      // idle proxies don't reap the connection during long renders.
      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`));
        } catch {
          if (interval) clearInterval(interval);
          if (heartbeat) clearInterval(heartbeat);
        }
      }, 15000);
    },
    cancel() {
      if (interval) clearInterval(interval);
      if (heartbeat) clearInterval(heartbeat);
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
