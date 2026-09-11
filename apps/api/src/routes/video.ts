import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Hono } from "hono";
import type { Context } from "hono";
import { err, quotaExceeded } from "../http.js";
import {
  MULTIPART_FIELDS,
  classifyFfmpegExit,
  migrateRenderPlan,
  type RenderKind,
} from "@repo/contracts";
import { isVisualFiltersDefault } from "@repo/ffmpeg-filters";
import {
  buildFFmpegArgs,
  telegramWebmTgDuration,
  TELEGRAM_WEBM_TG_TARGET_BYTES,
  TELEGRAM_WEBM_TG_CRF_STEP,
  TELEGRAM_WEBM_TG_CRF_MIN,
  TELEGRAM_WEBM_TG_CRF_MAX,
  clampTelegramCrf,
} from "../utils/ffmpegBuilder.js";
import { buildCutFFmpegArgs, totalCutDuration } from "../utils/cutBuilder.js";
import { buildMobileSubtitlesArgs } from "../utils/mobileSubtitlesBuilder.js";
import { resolveRequestInput, type ResolvedRequestInput } from "./input.js";
import { streamFile } from "./files.js";
import { jobError, jobLog, systemError } from "../observability.js";
import { parseCustomArgs } from "../validation.js";
import {
  deleteJob,
  getJob,
  insertJob,
  listJobs,
  updateJob,
  type JobRow,
  type JobStatus,
} from "../db.js";
import {
  FileStoreQuotaError,
  safeFilename,
  store,
  type FileDescriptor,
} from "../storage/index.js";

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
const LOG_TAIL_MAX_LINES = 50;
const LOG_TAIL_MAX_CHARS = 20_000;

function pushTail(tail: string[], line: string): string[] {
  tail.push(line);
  if (tail.length > LOG_TAIL_MAX_LINES)
    tail.splice(0, tail.length - LOG_TAIL_MAX_LINES);
  while (tail.join("\n").length > LOG_TAIL_MAX_CHARS && tail.length > 1)
    tail.shift();
  return tail;
}

/**
 * Reserve a job-owned artifact for ffmpeg to render into. The record exists
 * before ffmpeg spawns, so interrupted renders are tracked (reaped on job
 * delete, exempt from expiration while the job row lives).
 * `displayBase` is the export filename; the on-disk name is `<fileId>.<ext>`
 * (safe by construction). Throws FileStoreQuotaError on quota breach.
 */
function reserveOutputFile(
  jobId: string,
  kind: "output" | "alternate-output",
  ext: string,
  displayBase: string,
): { fileId: string; path: string } {
  const base = safeFilename(displayBase, "export") || "export";
  const { id, path: filePath } = store.reserve({
    role: "artifact",
    kind,
    filename: `${base}.${ext}`,
    ownerJobId: jobId,
  });
  return { fileId: id, path: filePath };
}

/**
 * Release every store file a job owns (input ref, outputs, subtitle PNGs).
 * Idempotent: already-released IDs and missing bytes are logged no-ops.
 */
function releaseJobFiles(
  job: Pick<
    JobRow,
    "inputFileId" | "outputFileId" | "alternateFileId" | "subtitleFileIds"
  >,
): { released: number; alreadyGone: number; bytesFreed: number } {
  const ids = [
    job.inputFileId,
    job.outputFileId,
    job.alternateFileId,
    ...(job.subtitleFileIds ?? []),
  ].filter((x): x is string => !!x);
  return store.releaseAll(ids);
}

/**
 * Single-pass export: terminal state is settled here (multi-pass callers
 * use runAttempt + failJob directly so they can run further iterations).
 * On success the reserved artifacts are finalized to their real byte sizes
 * (ffmpeg renders directly into reserved paths).
 */
async function runTranscode(jobId: string, args: string[], duration: number) {
  const code = await runAttempt(jobId, args, duration);
  if (code === -1) return;
  if (code === 0) {
    updateJob(jobId, { status: "completed", progress: 100, exitCode: 0 });
    const j = getJob(jobId);
    for (const id of [j?.outputFileId, j?.alternateFileId]) {
      if (id) store.finalize(id);
    }
    jobLog(jobId, "completed (exit 0)");
  } else {
    failJob(jobId, code);
  }
}

/**
 * Public job shape for API responses: file descriptors (id/name/size/mime)
 * instead of absolute filesystem paths. ffmpeg stderr (logTail) and spawn
 * errors echo absolute input/output paths, so those free-text fields are
 * redacted to `<store>` / `<tmp>` placeholders at this single choke point.
 */
function publicJob(j: JobRow): {
  jobId: string;
  status: JobRow["status"];
  progress: number;
  outputFile: FileDescriptor | null;
  alternateFile: FileDescriptor | null;
  error: string | null;
  logTail: string | null;
  exitCode: number | null;
  kind: string;
  filename: string;
  createdAt: number;
} {
  const redact = (s: string | null) =>
    s?.split(store.root).join("<store>").split(os.tmpdir()).join("<tmp>") ??
    null;
  return {
    jobId: j.jobId,
    status: j.status,
    progress: j.progress,
    outputFile: j.outputFileId ? store.describe(j.outputFileId) : null,
    alternateFile: j.alternateFileId ? store.describe(j.alternateFileId) : null,
    error: redact(j.error),
    logTail: redact(j.logTail),
    exitCode: j.exitCode,
    kind: j.kind,
    filename: j.filename,
    createdAt: j.createdAt,
  };
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

function pumpQueue() {
  while (activeCount < MAX_CONCURRENT && waitQueue.length > 0) {
    const nextId = waitQueue.shift()!;
    const start = starters.get(nextId);
    if (!start) continue;
    starters.delete(nextId);
    startNow(nextId, start);
  }
}

/** Mark processing and run; the slot is released (and the queue pumped) on settle. */
function startNow(jobId: string, start: () => Promise<void>) {
  activeCount++;
  updateJob(jobId, { status: "processing", progress: 0 });
  void start().finally(() => {
    activeCount = Math.max(0, activeCount - 1);
    pumpQueue();
  });
}

/**
 * Register a starter for a job already inserted as `queued`.
 * Returns true when the job starts immediately or is queued,
 * false when the queue is full (caller must 429 + delete the row).
 */
function enqueue(jobId: string, start: () => Promise<void>): boolean {
  if (activeCount < MAX_CONCURRENT) {
    startNow(jobId, start);
    return true;
  }
  if (waitQueue.length >= MAX_QUEUED) return false;
  starters.set(jobId, start);
  waitQueue.push(jobId);
  return true;
}

const app = new Hono();

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
 * Spawn ffmpeg, stream progress, wait for exit. Returns the exit code
 * (-1 when cooperatively cancelled — terminal state left alone so the
 * caller can run further passes). Spawn failure marks the job failed.
 */
async function runAttempt(
  jobId: string,
  args: string[],
  duration: number,
): Promise<number> {
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
    if (getJob(jobId)?.status === "cancelled") return -1;
    return await proc.exited;
  } catch (error) {
    if (getJob(jobId)?.status === "cancelled") return -1;
    updateJob(jobId, {
      status: "failed",
      error: error instanceof Error ? error.message : "FFmpeg failed to start.",
    });
    jobError(jobId, "failed to start:", error);
    return 1;
  } finally {
    procs.delete(jobId);
  }
}

/**
 * Shared failure formatting: numeric exitCode + machine-readable [CODE]
 * (+ retry hint) so clients can distinguish OOM-kills / bad inputs from
 * generic failures without parsing stderr, plus a last-5-lines summary.
 */
function failJob(jobId: string, code: number): void {
  const tail = getJob(jobId)?.logTail ?? "";
  const last = tail.split("\n").slice(-5).join("\n");
  const cls = classifyFfmpegExit(code, tail);
  updateJob(jobId, {
    status: "failed",
    exitCode: code,
    error: `FFmpeg exited with code ${code} [${cls.code}]${cls.retryable ? " (retryable)" : ""}. ${cls.message}${last ? `\nLast output:\n${last}` : ""}`,
  });
  jobError(jobId, `failed (exit ${code}, ${cls.code})`);
}

/**
 * Iterative CRF search for the webm-tg preset: encodes at the requested CRF,
 * then steps by TELEGRAM_WEBM_TG_CRF_STEP (±2) — up when over budget, down
 * when under — keeping the largest output that fits in
 * TELEGRAM_WEBM_TG_TARGET_BYTES. Attempts render to temp files; only the
 * winning pass is copied to the reserved output path.
 */
async function runWebmTgCrfSearch(
  jobId: string,
  makeArgs: (crf: number, outputPath: string) => string[],
  startCrf: number,
  duration: number,
  outputPath: string,
): Promise<void> {
  const target = TELEGRAM_WEBM_TG_TARGET_BYTES;
  const step = TELEGRAM_WEBM_TG_CRF_STEP;
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), `${jobId}-tg-`));
  let crf = clampTelegramCrf(startCrf);
  const visited = new Set<number>();
  let bestCrf: number | null = null;
  let bestSize = -1;
  let bestTmp: string | null = null;
  try {
    while (
      crf >= TELEGRAM_WEBM_TG_CRF_MIN &&
      crf <= TELEGRAM_WEBM_TG_CRF_MAX &&
      !visited.has(crf)
    ) {
      visited.add(crf);
      if (getJob(jobId)?.status === "cancelled") return;
      const attemptPath = path.join(scratch, `crf${crf}.webm`);
      const args = makeArgs(crf, attemptPath);
      jobLog(jobId, `webm-tg attempt crf=${crf} (target ${target} bytes)`);
      const code = await runAttempt(jobId, args, duration);
      if (code === -1) return;
      if (code !== 0) {
        failJob(jobId, code);
        return;
      }
      let size = -1;
      try {
        size = fs.statSync(attemptPath).size;
      } catch {
        failJob(jobId, code);
        return;
      }
      jobLog(jobId, `webm-tg attempt crf=${crf} size=${size} bytes`);
      if (size <= target) {
        if (size > bestSize) {
          if (bestTmp) {
            try {
              fs.unlinkSync(bestTmp);
            } catch {}
          }
          bestCrf = crf;
          bestSize = size;
          bestTmp = attemptPath;
        } else {
          try {
            fs.unlinkSync(attemptPath);
          } catch {}
        }
        if (size === target) break;
        const next = crf - step;
        if (next < TELEGRAM_WEBM_TG_CRF_MIN || visited.has(next)) break;
        crf = next;
      } else {
        try {
          fs.unlinkSync(attemptPath);
        } catch {}
        // Already hold a fitting pass: with step granularity the previous
        // best is the closest fit from above — stop instead of oscillating.
        if (bestCrf !== null) break;
        const next = crf + step;
        if (next > TELEGRAM_WEBM_TG_CRF_MAX || visited.has(next)) break;
        crf = next;
      }
    }
    if (getJob(jobId)?.status === "cancelled") return;
    if (!bestTmp) {
      // Unreachable for 3s 512px content (even CRF 63 fits), but never
      // violate the hard cap silently: fail instead of delivering oversize.
      updateJob(jobId, {
        status: "failed",
        error: `webm-tg could not fit ${target} bytes within CRF ${TELEGRAM_WEBM_TG_CRF_MIN}..${TELEGRAM_WEBM_TG_CRF_MAX}.`,
      });
      jobError(jobId, "webm-tg size search found no fitting pass");
      return;
    }
    fs.copyFileSync(bestTmp, outputPath);
    updateJob(jobId, { status: "completed", progress: 100, exitCode: 0 });
    jobLog(
      jobId,
      `webm-tg completed crf=${bestCrf} size=${bestSize} bytes (target ${target})`,
    );
  } finally {
    try {
      fs.rmSync(scratch, { recursive: true, force: true });
    } catch {}
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

/**
 * Claim a resolved input for a job: the file gets an extra ref so session
 * cleanup can't pull bytes out from under the job.
 */
function claimInputAsset(assetId: string | null, jobId: string): void {
  if (!assetId) return;
  store.share(assetId, jobId);
}

/** Queue-full / quota rollback: release the job's files, delete the row. */
function rollbackQueuedJob(jobId: string): void {
  const job = getJob(jobId);
  if (!job) return;
  const freed = releaseJobFiles(job);
  jobLog(
    jobId,
    `rolled back (${freed.released} file(s), ${freed.bytesFreed} bytes freed)`,
  );
  deleteJob(jobId);
}

/**
 * Shared prologue for the four transcode endpoints: multipart parse, plan
 * validation (v1 `{ version, kind, settings }` or legacy v0 bare settings
 * migrated by kind detection), input resolution. Returns the ready triple,
 * or an error response the route returns directly. Invalid plans are 422
 * with `issues[]` so old clients get an actionable error.
 */
async function readTranscodeRequest(
  c: Context,
  kind: RenderKind,
  messages: { log: string; invalid: string; empty: string },
): Promise<
  | { ok: true; form: FormData; settings: any; input: ResolvedRequestInput }
  | { ok: false; response: ReturnType<typeof err> }
> {
  let form: FormData;
  try {
    form = await c.req.formData();
  } catch (e) {
    systemError(`[${messages.log}] formData parse failed:`, e);
    return {
      ok: false,
      response: err(c, "INVALID_MULTIPART", {
        message: "Invalid multipart body",
      }),
    };
  }
  const field = form.get(MULTIPART_FIELDS.settings);
  if (typeof field !== "string") {
    return {
      ok: false,
      response: err(c, "VALIDATION_FAILED", {
        message: messages.invalid,
        issues: ["settings: required JSON string field"],
      }),
    };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(field);
  } catch {
    return {
      ok: false,
      response: err(c, "VALIDATION_FAILED", {
        message: messages.invalid,
        issues: ["settings: invalid JSON"],
      }),
    };
  }
  const migrated = migrateRenderPlan(raw, kind);
  if (!migrated.ok) {
    return {
      ok: false,
      response: err(
        c,
        migrated.reason === "unsupported-version"
          ? "PLAN_VERSION_UNSUPPORTED"
          : "VALIDATION_FAILED",
        { message: messages.invalid, issues: migrated.issues },
      ),
    };
  }
  if (migrated.plan.kind !== kind) {
    return {
      ok: false,
      response: err(c, "VALIDATION_FAILED", {
        message: messages.invalid,
        issues: [
          `plan kind "${migrated.plan.kind}" does not match this endpoint ("${kind}")`,
        ],
      }),
    };
  }
  let resolved: Awaited<ReturnType<typeof resolveRequestInput>>;
  try {
    resolved = await resolveRequestInput(c, form);
  } catch (e) {
    if (e instanceof FileStoreQuotaError)
      return {
        ok: false,
        response: quotaExceeded(c, e.neededBytes, e.quotaBytes),
      };
    throw e;
  }
  if (!resolved.ok) {
    return {
      ok: false,
      response: err(c, "FILE_REQUIRED", { message: messages.empty }),
    };
  }
  return {
    ok: true,
    form,
    settings: migrated.plan.settings,
    input: resolved.input,
  };
}

/**
 * Shared epilogue for the four transcode endpoints: insert the job as
 * `queued` (output already reserved before ffmpeg spawns), claim the input,
 * then enqueue. When the bounded queue is full the job is rolled back and
 * the caller returns the 429 (`Retry-After: 10`); otherwise null.
 */
function submitTranscode(
  c: Context,
  init: Omit<
    JobRow,
    "status" | "progress" | "error" | "logTail" | "exitCode" | "updatedAt"
  > & { isChunked: boolean },
  start: () => Promise<void>,
): ReturnType<typeof err> | null {
  const { isChunked: _isChunked, ...row } = init;
  insertJob({
    ...row,
    status: "queued",
    progress: 0,
    error: null,
    logTail: null,
    exitCode: null,
  });
  claimInputAsset(init.inputFileId, init.jobId);
  if (!enqueue(init.jobId, start)) {
    rollbackQueuedJob(init.jobId);
    return err(c, "QUEUE_FULL", {
      message: "Transcode queue is full, try again shortly.",
      details: { ...getQueueStats() },
      headers: { "Retry-After": "10" },
    });
  }
  return null;
}

app.post("/transcode/mobile", async (c) => {
  const req = await readTranscodeRequest(c, "mobile", {
    log: "transcode/mobile",
    invalid:
      "A video file and valid mobileLayout export settings are required. Requires 16:9 source to 9:16 stacked/full with 1 or 2 zones.",
    empty: "A video file or uploadId is required.",
  });
  if (!req.ok) return req.response;
  const settings = req.settings;
  const { assetId, temporaryPath, filename, isChunked } = req.input;
  const format = "mp4" as const;
  const jobId = crypto.randomUUID();
  const baseName = settings.exportFilename.trim() || filename;
  let originalOutput: { fileId: string; path: string };
  try {
    originalOutput = reserveOutputFile(jobId, "output", format, baseName);
  } catch (e) {
    if (assetId && !isChunked) store.release(assetId);
    if (e instanceof FileStoreQuotaError) {
      return quotaExceeded(c, e.neededBytes, e.quotaBytes);
    }
    throw e;
  }
  const originalOutputPath = originalOutput.path;
  // Zones are 0-1 (schema-enforced); builders scale to pixels directly.
  const ml = settings.mobileLayout;
  const mobileLayout = {
    mode: ml.mode,
    splitRatio: ml.splitRatio,
    zones: ml.zones,
  };
  let custom: { args: string[]; extraVf: string[] };
  try {
    // Mobile builds a filter_complex graph — -vf denied at parse.
    custom = parseCustomArgs(
      (settings.customFFmpegArgs || "").replace(/(^|\s)-an(\s|$)/g, " "),
      { allowVf: false },
    );
  } catch (e) {
    return err(c, "CUSTOM_ARGS_INVALID", {
      message: e instanceof Error ? e.message : "Invalid customFFmpegArgs.",
    });
  }
  if (!isVisualFiltersDefault(settings.visualFilters)) {
    return err(c, "CUSTOM_ARGS_INVALID", {
      message:
        "visualFilters cannot be combined with mobileLayout (this export builds its own filter graph). Use the plain transcode endpoint instead.",
    });
  }
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
    filename: baseName,
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
  const rejected = submitTranscode(
    c,
    {
      jobId,
      inputFileId: assetId,
      outputFileId: originalOutput.fileId,
      alternateFileId: null,
      subtitleFileIds: [],
      createdAt: Date.now(),
      kind: "mobile",
      filename: baseName,
      isChunked,
    },
    () => runTranscode(jobId, originalArgs, progressDuration),
  );
  if (rejected) return rejected;
  return c.json({
    jobId,
    progressUrl: `/api/transcode/progress/${jobId}`,
    output: { width: 1080, height: 1920 },
  });
});

app.post("/transcode/mobile/subtitles", async (c) => {
  const req = await readTranscodeRequest(c, "mobile-subtitles", {
    log: "transcode/mobile/subtitles",
    invalid:
      "A video file and valid mobileLayout export settings are required for subtitles endpoint.",
    empty: "A video file or uploadId is required for subtitles endpoint.",
  });
  if (!req.ok) return req.response;
  const { form } = req;
  const settings = req.settings;
  const {
    temporaryPath: subtitleTmp,
    filename: subtitleFilename,
    assetId: subtitleAssetId,
    isChunked: subtitleIsChunked,
  } = req.input;

  // Subtitles metadata: front-end sends a JSON array with startTime/endTime/x/y
  // in the `subtitles` field, plus one `subtitle_N` PNG file per entry.
  const rawSubtitles = form.get(MULTIPART_FIELDS.subtitles);
  let subtitlesMeta: Array<{
    startTime: number;
    endTime: number;
    x: number;
    y: number;
    width?: number;
    height?: number;
  }> = [];
  if (typeof rawSubtitles === "string" && rawSubtitles.trim()) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawSubtitles);
    } catch {
      return err(c, "SUBTITLES_INVALID", { message: "Invalid subtitles JSON" });
    }
    if (!Array.isArray(parsed)) {
      return err(c, "SUBTITLES_INVALID", { message: "Invalid subtitles JSON" });
    }
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

  // PNG overlays (`subtitle_0`, `subtitle_1`, …) pair positionally with
  // subtitlesMeta entries. The frontend appends them in order; the sort keeps
  // the pairing stable if parts ever arrive out of order. Wire format unchanged.
  const subtitlePrefix = `${MULTIPART_FIELDS.subtitleFilePrefix}_`;
  const pngEntries: Array<[string, File]> = [];
  for (const [k, v] of form.entries() as Iterable<[string, unknown]>) {
    if (v instanceof File && k.startsWith(subtitlePrefix))
      pngEntries.push([k, v]);
  }
  const pngIndex = (k: string) =>
    parseInt(k.slice(subtitlePrefix.length), 10) || 0;
  pngEntries.sort((a, b) => pngIndex(a[0]) - pngIndex(b[0]));
  const subtitleFiles = pngEntries.map(([, v]) => v);

  if (subtitlesMeta.length !== subtitleFiles.length) {
    return err(c, "SUBTITLES_INVALID", {
      message: `Subtitles count mismatch: meta ${subtitlesMeta.length} vs files ${subtitleFiles.length}`,
    });
  }

  for (const s of subtitlesMeta) {
    if (s.x < 0 || s.x > 100 || s.y < 0 || s.y > 100) {
      return err(c, "SUBTITLES_INVALID", {
        message: "Subtitle x/y must be 0-100",
      });
    }
  }
  const [trimStart, trimEnd] = settings.trimRange;

  const format = "mp4" as const;
  const jobId = crypto.randomUUID();
  const temporaryPath = subtitleTmp;

  // Subtitle PNGs are job-owned artifacts: reserved before bytes land, so a
  // failed write or queue rejection leaves tracked records, never strays.
  const subtitlePngPaths: string[] = [];
  const subtitleFileIds: string[] = [];
  try {
    for (let i = 0; i < subtitleFiles.length; i++) {
      const f = subtitleFiles[i];
      const { id, path: pngPath } = store.reserve({
        role: "artifact",
        kind: "subtitle-png",
        filename: `sub${i}.png`,
        mime: "image/png",
        ownerJobId: jobId,
      });
      await store.writeAtomic(id, await f.arrayBuffer());
      subtitleFileIds.push(id);
      subtitlePngPaths.push(pngPath);
    }
  } catch (e) {
    for (const id of subtitleFileIds) store.release(id);
    if (subtitleAssetId && !subtitleIsChunked) store.release(subtitleAssetId);
    if (e instanceof FileStoreQuotaError)
      return quotaExceeded(c, e.neededBytes, e.quotaBytes);
    throw e;
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
    zones: settings.mobileLayout.zones,
  };

  let custom: { args: string[]; extraVf: string[] };
  try {
    // Subtitles builder owns a filter_complex graph — -vf denied at parse.
    custom = parseCustomArgs(
      (settings.customFFmpegArgs || "").replace(/(^|\s)-an(\s|$)/g, " "),
      { allowVf: false },
    );
  } catch (e) {
    return err(c, "CUSTOM_ARGS_INVALID", {
      message: e instanceof Error ? e.message : "Invalid customFFmpegArgs.",
    });
  }
  if (!isVisualFiltersDefault(settings.visualFilters)) {
    return err(c, "CUSTOM_ARGS_INVALID", {
      message:
        "visualFilters cannot be combined with mobileLayout (this export builds its own filter graph). Use the plain transcode endpoint instead.",
    });
  }
  const baseName = settings.exportFilename.trim() || subtitleFilename;
  let originalOutput: { fileId: string; path: string };
  try {
    originalOutput = reserveOutputFile(jobId, "output", format, baseName);
  } catch (e) {
    for (const id of subtitleFileIds) store.release(id);
    if (subtitleAssetId && !subtitleIsChunked) store.release(subtitleAssetId);
    if (e instanceof FileStoreQuotaError)
      return quotaExceeded(c, e.neededBytes, e.quotaBytes);
    throw e;
  }
  const originalOutputPath = originalOutput.path;

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
    filename: baseName,
    speed: settings.exportSpeed,
    audioTracks: settings.audioTracks,
  });

  jobLog(jobId, "mobile-subtitles ffmpeg args:", originalArgs.join(" "));

  const rejected = submitTranscode(
    c,
    {
      jobId,
      inputFileId: subtitleAssetId,
      outputFileId: originalOutput.fileId,
      alternateFileId: null,
      subtitleFileIds,
      createdAt: Date.now(),
      kind: "mobile-subtitles",
      filename: baseName,
      isChunked: subtitleIsChunked,
    },
    () =>
      runTranscode(jobId, originalArgs, Math.max(0.001, trimEnd - trimStart)),
  );
  if (rejected) return rejected;
  return c.json({
    jobId,
    progressUrl: `/api/transcode/progress/${jobId}`,
    output: { width: 1080, height: 1920, subtitles: subtitlesMeta.length },
  });
});

app.post("/transcode/cut", async (c) => {
  const req = await readTranscodeRequest(c, "cut", {
    log: "transcode/cut",
    invalid:
      "A video file and valid cut settings are required (mode + non-overlapping cuts + zones for stack modes).",
    empty: "A video file or uploadId is required.",
  });
  if (!req.ok) return req.response;
  const settings = req.settings;
  const { assetId, temporaryPath, filename, isChunked } = req.input;
  const jobId = crypto.randomUUID();
  const baseName = settings.exportFilename.trim() || filename;
  let originalOutput: { fileId: string; path: string };
  try {
    originalOutput = reserveOutputFile(jobId, "output", "mp4", baseName);
  } catch (e) {
    if (assetId && !isChunked) store.release(assetId);
    if (e instanceof FileStoreQuotaError)
      return quotaExceeded(c, e.neededBytes, e.quotaBytes);
    throw e;
  }
  const originalOutputPath = originalOutput.path;
  const totalDuration = Math.max(0.001, totalCutDuration(settings.cuts));
  let custom: { args: string[]; extraVf: string[] };
  try {
    // Cut builder owns a filter_complex graph — -vf denied at parse.
    custom = parseCustomArgs(
      (settings.customFFmpegArgs || "").replace(/(^|\s)-an(\s|$)/g, " "),
      { allowVf: false },
    );
  } catch (e) {
    return err(c, "CUSTOM_ARGS_INVALID", {
      message: e instanceof Error ? e.message : "Invalid customFFmpegArgs.",
    });
  }
  const cutArgs = buildCutFFmpegArgs({
    inputPath: temporaryPath,
    filename: baseName,
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
  const rejected = submitTranscode(
    c,
    {
      jobId,
      inputFileId: assetId,
      outputFileId: originalOutput.fileId,
      alternateFileId: null,
      subtitleFileIds: [],
      createdAt: Date.now(),
      kind: "cut",
      filename: baseName,
      isChunked,
    },
    () => runTranscode(jobId, cutArgs, totalDuration),
  );
  if (rejected) return rejected;
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
  const req = await readTranscodeRequest(c, "generic", {
    log: "transcode",
    invalid: "A video file and valid export settings are required.",
    empty: "A video file or uploadId is required.",
  });
  if (!req.ok) return req.response;
  const settings = req.settings;
  const { assetId, temporaryPath, filename, isChunked } = req.input;

  const format = settings.exportFormat;
  const jobId = crypto.randomUUID();
  const isWebmTg = format === "webm-tg";

  // Reserve the render target in the store (record before ffmpeg
  // spawns). webm-tg renders a .webm file.
  const outputExt = isWebmTg ? "webm" : format;
  const baseName = settings.exportFilename.trim() || filename;
  let originalOutput: { fileId: string; path: string };
  try {
    originalOutput = reserveOutputFile(jobId, "output", outputExt, baseName);
  } catch (e) {
    if (assetId && !isChunked) store.release(assetId);
    if (e instanceof FileStoreQuotaError)
      return quotaExceeded(c, e.neededBytes, e.quotaBytes);
    throw e;
  }
  const originalOutputPath = originalOutput.path;

  const ml = settings.mobileLayout;
  const mobileLayout = ml
    ? {
        mode: ml.mode,
        splitRatio: ml.splitRatio,
        zones: ml.zones,
      }
    : null;
  // B4: -vf merges into our -vf chain only for the plain path; a
  // mobileLayout builds a filter_complex graph where -vf is denied.
  // webm-tg is a strict preset: custom args + visual stack are ignored
  // entirely so the rendered command stays exactly the telegram sticker
  // invocation.
  let custom: { args: string[]; extraVf: string[] };
  if (isWebmTg) {
    custom = { args: [], extraVf: [] };
  } else {
    try {
      custom = parseCustomArgs(settings.customFFmpegArgs, {
        allowVf: !mobileLayout,
      });
    } catch (e) {
      return err(c, "CUSTOM_ARGS_INVALID", {
        message: e instanceof Error ? e.message : "Invalid customFFmpegArgs.",
      });
    }
  }
  const visualFilters = isWebmTg ? undefined : settings.visualFilters;
  if (mobileLayout && !isVisualFiltersDefault(visualFilters)) {
    return err(c, "CUSTOM_ARGS_INVALID", {
      message:
        "visualFilters cannot be combined with mobileLayout (this export builds its own filter graph). Use the plain transcode endpoint instead.",
    });
  }
  let originalArgs: string[];
  try {
    originalArgs = buildFFmpegArgs({
      inputPath: temporaryPath,
      filename: baseName,
      sourceWidth: settings.sourceWidth,
      sourceHeight: settings.sourceHeight,
      trimRange: settings.trimRange,
      ignoreTrim: settings.ignoreTrim,
      crop: settings.crop ?? { x: 0, y: 0, width: 100, height: 100 },
      format,
      fps: isWebmTg ? undefined : settings.exportFps,
      crf: settings.exportFormat === "mov" ? undefined : settings.exportQuality,
      customArgs: custom.args,
      visualFilters: visualFilters as never,
      extraVideoFilters: custom.extraVf,
      outputPath: originalOutputPath,
      mobileLayout: mobileLayout as never,
      watermark: isWebmTg ? false : !!settings.watermark,
      gainDb: settings.gainDb,
      loudnormTargetLufs: settings.loudnormTargetLufs,
      fadeInSeconds: settings.fadeInSeconds,
      fadeOutSeconds: settings.fadeOutSeconds,
      muteSegments: settings.muteSegments,
      audioTrackIndex: settings.audioTrackIndex,
      audioTracks: isWebmTg ? undefined : settings.audioTracks,
    });
  } catch (e) {
    return err(c, "CUSTOM_ARGS_INVALID", {
      message: e instanceof Error ? e.message : "Invalid video filters.",
    });
  }

  jobLog(jobId, "ffmpeg args:", originalArgs.join(" "));

  // webm-tg renders trim (capped at 3s) or a flat 3s when trim is ignored.
  const duration = isWebmTg
    ? telegramWebmTgDuration(settings.trimRange, settings.ignoreTrim)
    : Math.max(0.001, settings.trimRange[1] - settings.trimRange[0]);
  const runAll = async () => {
    if (isWebmTg) {
      // Iterative CRF search (±2) toward TELEGRAM_WEBM_TG_TARGET_BYTES.
      const startCrf = clampTelegramCrf(settings.exportQuality);
      const cropSetting = settings.crop ?? {
        x: 0,
        y: 0,
        width: 100,
        height: 100,
      };
      await runWebmTgCrfSearch(
        jobId,
        (crf, attemptPath) =>
          buildFFmpegArgs({
            inputPath: temporaryPath,
            filename: baseName,
            sourceWidth: settings.sourceWidth,
            sourceHeight: settings.sourceHeight,
            trimRange: settings.trimRange,
            ignoreTrim: settings.ignoreTrim,
            crop: cropSetting,
            format,
            crf,
            outputPath: attemptPath,
          }),
        startCrf,
        duration,
        originalOutputPath,
      );
      const done = getJob(jobId);
      if (done?.status === "completed")
        for (const id of [done.outputFileId, done.alternateFileId])
          if (id) store.finalize(id);
      return;
    }
    await runTranscode(jobId, originalArgs, duration);
    const afterFirst = getJob(jobId);
    if (!afterFirst || afterFirst.status !== "completed") return;
    // webm-tg is a single strict pass: no speed-adjusted alternate output.
    if (!isWebmTg && settings.exportSpeed !== 1) {
      const suffix = `_${settings.exportSpeed.toFixed(1)}`;
      let alternate: { fileId: string; path: string };
      try {
        alternate = reserveOutputFile(
          jobId,
          "alternate-output",
          outputExt,
          baseName,
        );
      } catch (e) {
        const msg =
          e instanceof FileStoreQuotaError
            ? e.message
            : "Failed to reserve alternate output.";
        updateJob(jobId, { status: "failed", error: msg });
        jobError(jobId, "alternate pass not started:", msg);
        return;
      }
      const alternateOutputPath = alternate.path;
      const speedArgs = buildFFmpegArgs({
        inputPath: temporaryPath,
        filename: baseName,
        sourceWidth: settings.sourceWidth,
        sourceHeight: settings.sourceHeight,
        trimRange: settings.trimRange,
        ignoreTrim: settings.ignoreTrim,
        crop: settings.crop ?? { x: 0, y: 0, width: 100, height: 100 },
        format,
        outputSuffix: suffix,
        speed: settings.exportSpeed,
        fps: settings.exportFps,
        crf:
          settings.exportFormat === "mov" ? undefined : settings.exportQuality,
        customArgs: custom.args,
        visualFilters: visualFilters as never,
        extraVideoFilters: custom.extraVf,
        outputPath: alternateOutputPath,
        mobileLayout: mobileLayout as never,
        watermark: !!settings.watermark,
        gainDb: settings.gainDb,
        loudnormTargetLufs: settings.loudnormTargetLufs,
        fadeInSeconds: settings.fadeInSeconds,
        fadeOutSeconds: settings.fadeOutSeconds,
        muteSegments: settings.muteSegments,
        audioTrackIndex: settings.audioTrackIndex,
        audioTracks: settings.audioTracks,
      });
      updateJob(jobId, {
        alternateFileId: alternate.fileId,
        progress: 0,
      });
      await runTranscode(jobId, speedArgs, duration);
    }
  };

  const rejected = submitTranscode(
    c,
    {
      jobId,
      inputFileId: assetId,
      outputFileId: originalOutput.fileId,
      alternateFileId: null,
      subtitleFileIds: [],
      createdAt: Date.now(),
      kind: "transcode",
      filename: baseName,
      isChunked,
    },
    runAll,
  );
  if (rejected) return rejected;

  return c.json({ jobId, progressUrl: `/api/transcode/progress/${jobId}` });
});

/**
 * Shared jobs snapshot payload (B1 SQLite rows + B2 queue stats).
 * Used by both GET /transcode/jobs and the SSE jobs stream. Exposes file
 * descriptors (opaque IDs) — never absolute filesystem paths.
 */
function buildJobsPayload() {
  const list = listJobs().map((j) => ({
    ...publicJob(j),
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
  if (job.status === "queued") {
    const qi = waitQueue.indexOf(id);
    if (qi >= 0) waitQueue.splice(qi, 1);
    starters.delete(id);
  }
  if (job.status === "processing") {
    killProc(id);
    // Release the slot now; runTranscode's finally still decrements via pump
    // guard — instead mark cancelled first so the runner no-ops its finish.
    updateJob(id, { status: "cancelled" });
  }
  const fresh = getJob(id);
  if (fresh) {
    // Keep-until-delete ends here: release the job's files (idempotent —
    // shared chunked inputs survive while their upload session lives).
    const freed = releaseJobFiles(fresh);
    jobLog(
      id,
      `deleted (${freed.released} file(s), ${freed.bytesFreed} bytes freed)`,
    );
  }
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
app.delete("/transcode/jobs", (c) => {
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
  // Also reconcile the store when clearing everything: frees crash orphans
  // and expired files by ownership (no filename regexes).
  let swept: Record<string, number> | null = null;
  if (!filter || filter === "all") {
    try {
      const r = store.reconcile();
      swept = { ...r };
      if (r.orphans + r.expired + r.staleReserved + r.missing > 0) {
        jobLog(
          "sweep",
          `reconcile freed ${r.bytesFreed} bytes (${r.orphans} orphans, ${r.expired} expired, ${r.staleReserved} stale, ${r.missing} missing)`,
        );
      }
    } catch {}
  }
  return c.json({
    cleared: deleted,
    killed,
    ids,
    filter: filter ?? "all",
    swept,
  });
});

app.delete("/transcode/jobs/:jobId", async (c) => {
  const id = c.req.param("jobId");
  // ?mode=cancel → cooperative cancel: kill ffmpeg, keep row + files so the
  // user can inspect logTail; SSE emits { status: "cancelled" } then closes.
  if (c.req.query("mode") === "cancel") {
    const job = getJob(id);
    if (!job) return err(c, "JOB_NOT_FOUND", { message: "Job not found." });
    if (job.status === "queued") {
      const qi = waitQueue.indexOf(id);
      if (qi >= 0) waitQueue.splice(qi, 1);
      starters.delete(id);
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
  if (!job) return err(c, "JOB_NOT_FOUND", { message: "Job not found." });
  const prevStatus = job.status;
  hardDeleteJob(id);
  return c.json({ deleted: id, status: prevStatus });
});

app.patch("/transcode/jobs/:jobId", async (c) => {
  const id = c.req.param("jobId");
  const job = getJob(id);
  if (!job) return err(c, "JOB_NOT_FOUND", { message: "Job not found." });
  const body = (await c.req.json().catch(() => null)) as {
    filename?: unknown;
  } | null;
  const raw = typeof body?.filename === "string" ? body.filename.trim() : "";
  if (!raw || raw.length > 128) {
    return err(c, "VALIDATION_FAILED", {
      message: "filename must be a non-empty string up to 128 characters.",
      issues: ["filename: required, max 128 characters"],
    });
  }
  const filename = safeFilename(raw, "export");
  updateJob(id, { filename });
  return c.json({ jobId: id, filename });
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
app.get("/transcode/download/:jobId", (c) => {
  const id = c.req.param("jobId");
  const job = getJob(id);
  if (!job || job.status !== "completed") {
    return err(c, "JOB_NOT_COMPLETED", {
      message: "Job not found or not completed.",
    });
  }

  // Resolve the rendered artifact by opaque ID — the on-disk path never
  // leaves the server.
  const rec = job.outputFileId ? store.get(job.outputFileId) : null;
  if (!rec) {
    return err(c, "OUTPUT_MISSING", { message: "Output file not found." });
  }
  store.syncSize(rec.id);
  const fresh = store.get(rec.id);
  return streamFile(
    fresh ?? rec,
    c.req.header("Range") ?? c.req.header("range"),
  );
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
  if (!initial)
    return err(c, "JOB_NOT_FOUND", { message: "Export job not found." });

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
        const payload = {
          ...publicJob(job),
          queuePosition,
          queue: getQueueStats(),
        };
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
