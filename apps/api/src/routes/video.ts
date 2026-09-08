import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Hono } from "hono";
import type { Context } from "hono";
import type { z } from "zod";
import { err } from "../http.js";
import {
  MULTIPART_FIELDS,
  UPLOAD_ID_HEADER,
  UPLOAD_ID_QUERY,
  classifyFfmpegExit,
  migrateRenderPlan,
  type RenderKind,
} from "@repo/contracts";
import { buildFFmpegArgs, telegramWebmTgDuration } from "../utils/ffmpegBuilder.js";
import { buildCutFFmpegArgs, totalCutDuration } from "../utils/cutBuilder.js";
import { buildMobileSubtitlesArgs } from "../utils/mobileSubtitlesBuilder.js";
import { consumeUpload } from "./upload.js";
import { streamFile } from "./files.js";
import { jobError, jobLog, systemError } from "../observability.js";
import {
  cutSettingsSchema,
  genericSettingsSchema,
  mobileSettingsSchema,
  normalizeTrimAlias,
  parseCustomArgs,
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
import {
  ArtifactStore,
  AssetStore,
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
// Deprecated legacy sweep pattern (pre-AssetStore /tmp names). New files live
// under the store root and are reconciled by ownership, not by name.
const LEGACY_JOB_INPUT_RE = /^[0-9a-f-]{36}-/;
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
  const { id, path: filePath } = ArtifactStore.reserve({
    kind,
    filename: `${base}.${ext}`,
    ownerJobId: jobId,
  });
  return { fileId: id, path: filePath };
}

/**
 * Release every store file a job owns (input ref, outputs, subtitle PNGs).
 * Idempotent: already-released IDs and missing bytes are logged no-ops.
 * Pre-AssetStore rows (null IDs, mirror paths only) fall back to direct
 * unlink so old databases still clean up fully.
 */
function releaseJobFiles(
  job: Pick<
    JobRow,
    | "inputFileId"
    | "outputFileId"
    | "alternateFileId"
    | "subtitleFileIds"
    | "outputPath"
    | "alternateOutputPath"
    | "temporaryInputPath"
    | "subtitlePaths"
  >,
): { released: number; alreadyGone: number; bytesFreed: number } {
  const ids = [
    job.inputFileId,
    job.outputFileId,
    job.alternateFileId,
    ...(job.subtitleFileIds ?? []),
  ].filter((x): x is string => !!x);
  const res = ArtifactStore.releaseAll(ids);
  const legacyPaths = [
    job.inputFileId ? null : job.temporaryInputPath,
    job.outputFileId ? null : job.outputPath,
    job.alternateFileId ? null : job.alternateOutputPath,
    ...((job.subtitleFileIds?.length ?? 0) > 0 ? [] : (job.subtitlePaths ?? [])),
  ].filter((x): x is string => !!x);
  for (const p of legacyPaths) {
    try {
      const size = fs.statSync(p).size;
      fs.unlinkSync(p);
      res.released++;
      res.bytesFreed += size;
    } catch {}
  }
  return res;
}

/**
 * Record real byte sizes on a completed job's artifacts (ffmpeg writes
 * directly to reserved paths, so sizes are synced at settle time).
 */
function settleJobFiles(jobId: string): void {
  const j = getJob(jobId);
  if (!j || j.status !== "completed") return;
  for (const id of [j.outputFileId, j.alternateFileId]) {
    if (id) ArtifactStore.finalize(id);
  }
}

/**
 * Public job shape for API responses: file descriptors (id/name/size/mime)
 * instead of absolute filesystem paths. ffmpeg stderr (logTail) and spawn
 * errors echo absolute input/output paths, so those free-text fields are
 * redacted to `<store>` / `<tmp>` placeholders at this single choke point.
 */
function scrubPaths(s: string | null): string | null {
  if (!s) return s;
  return s.split(store.root).join("<store>").split(os.tmpdir()).join("<tmp>");
}
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
  return {
    jobId: j.jobId,
    status: j.status,
    progress: j.progress,
    outputFile: j.outputFileId ? ArtifactStore.describe(j.outputFileId) : null,
    alternateFile: j.alternateFileId
      ? ArtifactStore.describe(j.alternateFileId)
      : null,
    error: scrubPaths(j.error),
    logTail: scrubPaths(j.logTail),
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
  /** Owning asset record (chunked session file, or fresh request-input). */
  assetId: string | null;
  temporaryPath: string;
  filename: string;
  isChunked: boolean;
} | null> {
  const headerId = c.req.header(UPLOAD_ID_HEADER);
  const queryId = c.req.query(UPLOAD_ID_QUERY);
  const fieldId = form.get(MULTIPART_FIELDS.uploadId);
  const uploadId =
    headerId ??
    queryId ??
    (typeof fieldId === "string" ? fieldId.trim() : null);
  if (uploadId) {
    const consumed = consumeUpload(uploadId);
    if (!consumed) return null;
    return {
      assetId: consumed.assetId,
      temporaryPath: consumed.path,
      filename: consumed.filename,
      isChunked: true,
    };
  }
  const file = form.get(MULTIPART_FIELDS.file);
  if (!(file instanceof File)) return null;
  // Record-before-bytes: reserve the asset row first so a failed write or a
  // later quota/queue rejection leaves a tracked record, never a stray file.
  // Throws FileStoreQuotaError (routes map it to 507).
  const size = Number.isFinite(file.size) ? file.size : 0;
  const quota = store.checkQuota(size);
  if (!quota.ok) throw new FileStoreQuotaError(size, quota.quotaBytes);
  const { id, path: tmp } = AssetStore.reserve({
    kind: "request-input",
    filename: file.name || "upload.bin",
    mime: file.type || undefined,
    sizeHint: size,
  });
  try {
    await Bun.write(tmp, file);
  } catch (e) {
    AssetStore.release(id);
    throw e;
  }
  AssetStore.finalize(id);
  return { assetId: id, temporaryPath: tmp, filename: file.name, isChunked: false };
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
      // last-5-lines summary kept for human readability. classifyFfmpegExit
      // tags the row with a machine-readable [CODE] (+ retry hint) so the
      // Admin UI and clients can distinguish OOM-kills / bad inputs from
      // generic failures without parsing stderr.
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

function queueFullResponse(c: Context) {
  return err(c, "QUEUE_FULL", {
    message: "Transcode queue is full, try again shortly.",
    details: { ...getQueueStats() },
    headers: { "Retry-After": "10" },
  });
}

function quotaExceededResponse(c: Context, e: FileStoreQuotaError) {
  return err(c, "QUOTA_EXCEEDED", {
    message: e.message,
    details: { neededBytes: e.neededBytes, quotaBytes: e.quotaBytes },
  });
}

/**
 * Claim a resolved input for a job: chunked session files are shared
 * (extra ref so session cleanup can't pull bytes out from under the job),
 * single-shot request files are adopted (ownership transfer).
 */
function claimInputAsset(
  assetId: string | null,
  isChunked: boolean,
  jobId: string,
): void {
  if (!assetId) return;
  if (isChunked) AssetStore.share(assetId, jobId);
  else AssetStore.adopt(assetId, jobId);
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

const SETTINGS_SCHEMAS = {
  generic: genericSettingsSchema,
  mobile: mobileSettingsSchema,
  "mobile-subtitles": mobileSettingsSchema,
  cut: cutSettingsSchema,
} as const;

/**
 * Parse the multipart `settings` field as a versioned render plan.
 * Accepts v0 bare settings (legacy — migrated by kind detection) and the
 * v1 `{ version, kind, settings }` wrapper; anything else is rejected
 * explicitly so old clients get an actionable error, not opaque validation.
 */
function parsePlanField<K extends RenderKind>(
  value: FormDataEntryValue | null,
  kind: K,
):
  | { ok: true; settings: z.infer<(typeof SETTINGS_SCHEMAS)[K]> }
  | {
      ok: false;
      issues: string[];
      reason: "invalid" | "unsupported-version";
    } {
  if (typeof value !== "string") {
    return {
      ok: false,
      issues: ["settings: required JSON string field"],
      reason: "invalid",
    };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(value);
  } catch {
    return { ok: false, issues: ["settings: invalid JSON"], reason: "invalid" };
  }
  const migrated = migrateRenderPlan(raw, kind);
  if (!migrated.ok) return migrated;
  if (migrated.plan.kind !== kind) {
    return {
      ok: false,
      issues: [
        `plan kind "${migrated.plan.kind}" does not match this endpoint ("${kind}")`,
      ],
      reason: "invalid",
    };
  }
  return {
    ok: true,
    settings: migrated.plan.settings as z.infer<(typeof SETTINGS_SCHEMAS)[K]>,
  };
}

function planError(
  c: Context,
  r: { issues: string[]; reason: "invalid" | "unsupported-version" },
  message: string,
) {
  return err(
    c,
    r.reason === "unsupported-version"
      ? "PLAN_VERSION_UNSUPPORTED"
      : "VALIDATION_FAILED",
    { message, issues: r.issues },
  );
}

app.post("/transcode/mobile", async (c) => {
  let form: FormData;
  try {
    form = await c.req.formData();
  } catch (e) {
    systemError("[transcode/mobile] formData parse failed:", e);
    return err(c, "INVALID_MULTIPART", { message: "Invalid multipart body" });
  }
  const mobileParsed = parsePlanField(
    form.get(MULTIPART_FIELDS.settings),
    "mobile",
  );
  if (!mobileParsed.ok) {
    return planError(
      c,
      mobileParsed,
      "A video file and valid mobileLayout export settings are required. Requires 16:9 source to 9:16 stacked/full with 1 or 2 zones.",
    );
  }
  const settings = normalizeTrimAlias(mobileParsed.settings);
  let resolved: Awaited<ReturnType<typeof resolveInputFile>>;
  try {
    resolved = await resolveInputFile(
      c as unknown as {
        req: {
          header: (n: string) => string | undefined;
          query: (n: string) => string | undefined;
        };
      },
      form,
    );
  } catch (e) {
    if (e instanceof FileStoreQuotaError) return quotaExceededResponse(c, e);
    throw e;
  }
  if (!resolved)
    return err(c, "FILE_REQUIRED", {
      message: "A video file or uploadId is required.",
    });
  const { assetId, temporaryPath, filename, isChunked } = resolved;
  const format = "mp4" as const;
  const jobId = crypto.randomUUID();
  const exportBase = settings.exportFilename.trim() || filename;
  let originalOutput: { fileId: string; path: string };
  try {
    originalOutput = reserveOutputFile(jobId, "output", format, exportBase);
  } catch (e) {
    if (e instanceof FileStoreQuotaError) {
      if (assetId && !isChunked) AssetStore.release(assetId);
      return quotaExceededResponse(c, e);
    }
    throw e;
  }
  const originalOutputPath = originalOutput.path;
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
  if ("argError" in custom)
    return err(c, "CUSTOM_ARGS_INVALID", { message: custom.argError });
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
    inputFileId: assetId,
    outputFileId: originalOutput.fileId,
    alternateFileId: null,
    subtitleFileIds: [],
    createdAt: Date.now(),
    kind: "mobile",
    filename: settings.exportFilename.trim() || filename,
  });
  claimInputAsset(assetId, isChunked, jobId);
  const started = enqueue(jobId, () =>
    runTranscode(jobId, originalArgs, progressDuration).finally(() =>
      settleJobFiles(jobId),
    ),
  );
  if (!started) {
    rollbackQueuedJob(jobId);
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
    return err(c, "INVALID_MULTIPART", { message: "Invalid multipart body" });
  }
  const subParsed = parsePlanField(
    form.get(MULTIPART_FIELDS.settings),
    "mobile-subtitles",
  );
  if (!subParsed.ok) {
    return planError(
      c,
      subParsed,
      "A video file and valid mobileLayout export settings are required for subtitles endpoint.",
    );
  }
  const settings = normalizeTrimAlias(subParsed.settings);
  let resolvedSubtitle: Awaited<ReturnType<typeof resolveInputFile>>;
  try {
    resolvedSubtitle = await resolveInputFile(
      c as unknown as {
        req: {
          header: (n: string) => string | undefined;
          query: (n: string) => string | undefined;
        };
      },
      form,
    );
  } catch (e) {
    if (e instanceof FileStoreQuotaError) return quotaExceededResponse(c, e);
    throw e;
  }
  if (!resolvedSubtitle)
    return err(c, "FILE_REQUIRED", {
      message: "A video file or uploadId is required for subtitles endpoint.",
    });
  const {
    temporaryPath: subtitleTmp,
    filename: subtitleFilename,
    assetId: subtitleAssetId,
    isChunked: subtitleIsChunked,
  } = resolvedSubtitle;
  // alias for below reuse — shadow outer file var already removed
  const file = { name: subtitleFilename } as File;

  // Parse subtitles metadata: front-end sends JSON array with startTime/endTime/x/y
  const rawSubtitles =
    form.get(MULTIPART_FIELDS.subtitles) ??
    form.get(MULTIPART_FIELDS.subtitlesMeta) ??
    form.get(MULTIPART_FIELDS.subtitles_meta);
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
      return err(c, "SUBTITLES_INVALID", { message: "Invalid subtitles JSON" });
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
    ([k, v]) => v instanceof File && k.startsWith(MULTIPART_FIELDS.subtitleFilePrefix),
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
      return err(c, "SUBTITLES_INVALID", {
        message: `Subtitles count mismatch: meta ${subtitlesMeta.length} vs files ${subtitleFiles.length}`,
      });
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
      return err(c, "SUBTITLES_INVALID", { message: "Subtitle x/y must be 0-100" });
    }
  }

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
      const { id, path: pngPath } = ArtifactStore.reserve({
        kind: "subtitle-png",
        filename: `sub${i}.png`,
        mime: "image/png",
        ownerJobId: jobId,
      });
      await ArtifactStore.writeAtomic(id, await f.arrayBuffer());
      subtitleFileIds.push(id);
      subtitlePngPaths.push(pngPath);
    }
  } catch (e) {
    for (const id of subtitleFileIds) ArtifactStore.release(id);
    if (subtitleAssetId && !subtitleIsChunked)
      AssetStore.release(subtitleAssetId);
    if (e instanceof FileStoreQuotaError) return quotaExceededResponse(c, e);
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
  if ("argError" in custom)
    return err(c, "CUSTOM_ARGS_INVALID", { message: custom.argError });
  const exportBase = settings.exportFilename.trim() || file.name;
  let originalOutput: { fileId: string; path: string };
  try {
    originalOutput = reserveOutputFile(jobId, "output", format, exportBase);
  } catch (e) {
    for (const id of subtitleFileIds) ArtifactStore.release(id);
    if (subtitleAssetId && !subtitleIsChunked)
      AssetStore.release(subtitleAssetId);
    if (e instanceof FileStoreQuotaError) return quotaExceededResponse(c, e);
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
    inputFileId: subtitleAssetId,
    outputFileId: originalOutput.fileId,
    alternateFileId: null,
    subtitleFileIds,
    createdAt: Date.now(),
    kind: "mobile-subtitles",
    filename: settings.exportFilename.trim() || file.name,
  });
  claimInputAsset(subtitleAssetId, subtitleIsChunked, jobId);
  const started = enqueue(jobId, () =>
    runTranscode(jobId, originalArgs, Math.max(0.001, trimEnd - trimStart)).finally(() =>
      settleJobFiles(jobId),
    ),
  );
  if (!started) {
    rollbackQueuedJob(jobId);
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
    return err(c, "INVALID_MULTIPART", { message: "Invalid multipart body" });
  }
  const cutParsed = parsePlanField(form.get(MULTIPART_FIELDS.settings), "cut");
  if (!cutParsed.ok) {
    return planError(
      c,
      cutParsed,
      "A video file and valid cut settings are required (mode + non-overlapping cuts + zones for stack modes).",
    );
  }
  const settings = cutParsed.settings;
  let resolved: Awaited<ReturnType<typeof resolveInputFile>>;
  try {
    resolved = await resolveInputFile(
      c as unknown as {
        req: {
          header: (n: string) => string | undefined;
          query: (n: string) => string | undefined;
        };
      },
      form,
    );
  } catch (e) {
    if (e instanceof FileStoreQuotaError) return quotaExceededResponse(c, e);
    throw e;
  }
  if (!resolved)
    return err(c, "FILE_REQUIRED", {
      message: "A video file or uploadId is required.",
    });
  const { assetId, temporaryPath, filename, isChunked } = resolved;
  const jobId = crypto.randomUUID();
  const exportBase = settings.exportFilename.trim() || filename;
  let originalOutput: { fileId: string; path: string };
  try {
    originalOutput = reserveOutputFile(jobId, "output", "mp4", exportBase);
  } catch (e) {
    if (assetId && !isChunked) AssetStore.release(assetId);
    if (e instanceof FileStoreQuotaError) return quotaExceededResponse(c, e);
    throw e;
  }
  const originalOutputPath = originalOutput.path;
  const totalDuration = Math.max(0.001, totalCutDuration(settings.cuts));
  const custom = parseArgsField(
    (settings.customFFmpegArgs || "").replace(/(^|\s)-an(\s|$)/g, " "),
    false, // cut builder owns a filter_complex graph
  );
  if ("argError" in custom)
    return err(c, "CUSTOM_ARGS_INVALID", { message: custom.argError });
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
    inputFileId: assetId,
    outputFileId: originalOutput.fileId,
    alternateFileId: null,
    subtitleFileIds: [],
    createdAt: Date.now(),
    kind: "cut",
    filename: settings.exportFilename.trim() || filename,
  });
  claimInputAsset(assetId, isChunked, jobId);
  const started = enqueue(jobId, () =>
    runTranscode(jobId, cutArgs, totalDuration).finally(() =>
      settleJobFiles(jobId),
    ),
  );
  if (!started) {
    rollbackQueuedJob(jobId);
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
    return err(c, "INVALID_MULTIPART", { message: "Invalid multipart body" });
  }
  const genericParsed = parsePlanField(
    form.get(MULTIPART_FIELDS.settings),
    "generic",
  );
  if (!genericParsed.ok) {
    return planError(
      c,
      genericParsed,
      "A video file and valid export settings are required.",
    );
  }
  const settings = normalizeTrimAlias(genericParsed.settings);
  let resolvedMain: Awaited<ReturnType<typeof resolveInputFile>>;
  try {
    resolvedMain = await resolveInputFile(
      c as unknown as {
        req: {
          header: (n: string) => string | undefined;
          query: (n: string) => string | undefined;
        };
      },
      form,
    );
  } catch (e) {
    if (e instanceof FileStoreQuotaError) return quotaExceededResponse(c, e);
    throw e;
  }
  if (!resolvedMain)
    return err(c, "FILE_REQUIRED", {
      message: "A video file or uploadId is required.",
    });
  const { assetId, temporaryPath, filename, isChunked } = resolvedMain;
  const file = { name: filename } as File;
  void file;

  const format = settings.exportFormat;
  const jobId = crypto.randomUUID();
  const isWebmTg = format === "webm-tg";

  // Reserve the render target in the ArtifactStore (record before ffmpeg
  // spawns). webm-tg renders a .webm file.
  const outputExt = isWebmTg ? "webm" : format;
  const exportBase = settings.exportFilename.trim() || filename;
  let originalOutput: { fileId: string; path: string };
  try {
    originalOutput = reserveOutputFile(jobId, "output", outputExt, exportBase);
  } catch (e) {
    if (assetId && !isChunked) AssetStore.release(assetId);
    if (e instanceof FileStoreQuotaError) return quotaExceededResponse(c, e);
    throw e;
  }
  const originalOutputPath = originalOutput.path;

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
  // webm-tg is a strict preset: custom args are ignored entirely so the
  // rendered command stays exactly the telegram sticker invocation.
  const custom = isWebmTg
    ? { args: [] as string[], extraVf: [] as string[] }
    : parseArgsField(settings.customFFmpegArgs, !mobileLayout);
  if ("argError" in custom)
    return err(c, "CUSTOM_ARGS_INVALID", { message: custom.argError });
  const originalArgs = buildFFmpegArgs({
    inputPath: temporaryPath,
    filename: settings.exportFilename.trim() || filename,
    sourceWidth: settings.sourceWidth,
    sourceHeight: settings.sourceHeight,
    trimRange: settings.trimRange,
    ignoreTrim: settings.ignoreTrim,
    crop: settings.crop ?? { x: 0, y: 0, width: 100, height: 100 },
    format,
    fps: isWebmTg ? undefined : settings.exportFps,
    crf:
      settings.exportFormat === "mov" ? undefined : settings.exportQuality,
    customArgs: custom.args,
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

  jobLog(jobId, "ffmpeg args:", originalArgs.join(" "));

  createQueuedJob({
    jobId,
    outputPath: originalOutputPath,
    alternateOutputPath: null,
    temporaryInputPath: temporaryPath,
    subtitlePaths: [],
    inputFileId: assetId,
    outputFileId: originalOutput.fileId,
    alternateFileId: null,
    subtitleFileIds: [],
    createdAt: Date.now(),
    kind: "transcode",
    filename: settings.exportFilename.trim() || filename,
  });
  claimInputAsset(assetId, isChunked, jobId);

  // webm-tg renders trim (capped at 3s) or a flat 3s when trim is ignored.
  const duration = isWebmTg
    ? telegramWebmTgDuration(settings.trimRange, settings.ignoreTrim)
    : Math.max(0.001, settings.trimRange[1] - settings.trimRange[0]);
  const runAll = async () => {
    await runTranscode(jobId, originalArgs, duration);
    settleJobFiles(jobId);
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
          exportBase,
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
        filename: settings.exportFilename.trim() || filename,
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
        alternateOutputPath,
        alternateFileId: alternate.fileId,
        progress: 0,
      });
      await runTranscode(jobId, speedArgs, duration);
      settleJobFiles(jobId);
    }
  };

  const started = enqueue(jobId, runAll);
  if (!started) {
    rollbackQueuedJob(jobId);
    return queueFullResponse(c);
  }

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
  if (job.status === "queued") dequeue(id);
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
  // Also reconcile the store when clearing everything: frees crash orphans
  // and expired files by ownership (no filename regexes). Pre-AssetStore
  // /tmp files keep the legacy regex sweep below until they age out.
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
  try {
    // Legacy sweep for pre-AssetStore strays (apps/api/temp_* and /tmp/*
    // matching the old job pattern). Deprecated: all new files live under
    // the store root and are reconciled above.
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
          LEGACY_JOB_INPUT_RE.test(f) &&
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
  return c.json({
    cleared: deleted,
    killed,
    ids,
    filter: filter ?? "all",
    swept,
  });
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
    if (!job) return err(c, "JOB_NOT_FOUND", { message: "Job not found." });
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
app.get("/transcode/download/:jobId", async (c) => {
  const id = c.req.param("jobId");
  const job = getJob(id);
  if (!job || job.status !== "completed") {
    return err(c, "JOB_NOT_COMPLETED", {
      message: "Job not found or not completed.",
    });
  }

  // Resolve the rendered artifact by opaque ID — the on-disk path never
  // leaves the server. Falls back to the legacy mirror path for
  // pre-AssetStore rows.
  const rec = job.outputFileId ? ArtifactStore.get(job.outputFileId) : null;
  if (rec) {
    ArtifactStore.syncSize(rec.id);
    const fresh = ArtifactStore.get(rec.id);
    return streamFile(fresh ?? rec, c.req.header("Range") ?? c.req.header("range"));
  }
  const filePath = job.outputPath;
  let stat: { size: number };
  try {
    stat = fs.statSync(filePath);
  } catch (e) {
    systemError("[transcode/download] failed stating output file:", e);
    return err(c, "OUTPUT_MISSING", { message: "Output file not found." });
  }
  const total = stat.size;
  if (total <= 0) {
    return err(c, "OUTPUT_EMPTY", { message: "Output file is empty." });
  }

  const ext = filePath.split(".").pop()?.toLowerCase();
  const contentType =
    ext === "mp4"
      ? "video/mp4"
      : ext === "webm"
        ? "video/webm"
        : ext === "mov"
          ? "video/quicktime"
          : ext === "gif"
            ? "image/gif"
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
      return err(c, "RANGE_INVALID", {
        message: "Invalid Range header.",
        headers: { "Content-Range": `bytes */${total}` },
      });
    }
    let start = m[1] === "" ? total - Number(m[2]) : Number(m[1]);
    let end = m[2] === "" ? total - 1 : Number(m[2]);
    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      return err(c, "RANGE_INVALID", {
        message: "Invalid Range header.",
        headers: { "Content-Range": `bytes */${total}` },
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
