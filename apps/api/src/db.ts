import { Database } from "bun:sqlite";
import fs from "node:fs";
import path from "node:path";

export type JobStatus =
  "queued" | "processing" | "completed" | "failed" | "cancelled";

export interface JobRow {
  jobId: string;
  status: JobStatus;
  progress: number;
  error: string | null;
  logTail: string | null;
  exitCode: number | null;
  /** Opaque store file IDs — the only file references. */
  inputFileId: string | null;
  outputFileId: string | null;
  alternateFileId: string | null;
  subtitleFileIds: string[];
  createdAt: number;
  updatedAt: number;
  kind: string;
  filename: string;
}

export interface UploadRow {
  uploadId: string;
  filename: string;
  totalSize: number;
  received: number;
  temporaryPath: string;
  /** Owning store record for the pre-allocated session file. */
  fileId: string | null;
  createdAt: number;
  chunks: number[];
}

function resolveDataDir(): string {
  // import.meta.dir = apps/api/src → ../.data = apps/api/.data
  const dir = path.join(import.meta.dir, "..", ".data");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const DATA_DIR = resolveDataDir();
const DB_PATH = path.join(DATA_DIR, "app.sqlite");

export const db = new Database(DB_PATH);
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA synchronous = NORMAL;");

db.exec(`
CREATE TABLE IF NOT EXISTS jobs (
  jobId TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  progress REAL NOT NULL DEFAULT 0,
  error TEXT,
  logTail TEXT,
  exitCode INTEGER,
  inputFileId TEXT,
  outputFileId TEXT,
  alternateFileId TEXT,
  subtitleFileIds TEXT DEFAULT '[]',
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  kind TEXT NOT NULL DEFAULT 'transcode',
  filename TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS uploads (
  uploadId TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  totalSize INTEGER NOT NULL,
  received INTEGER NOT NULL DEFAULT 0,
  temporaryPath TEXT NOT NULL,
  fileId TEXT,
  createdAt INTEGER NOT NULL,
  chunks TEXT NOT NULL DEFAULT '[]'
);
`);

function rowToJob(r: Record<string, unknown>): JobRow {
  return {
    jobId: String(r.jobId),
    status: r.status as JobStatus,
    progress: Number(r.progress ?? 0),
    error: (r.error as string | null) ?? null,
    logTail: (r.logTail as string | null) ?? null,
    exitCode: (r.exitCode as number | null) ?? null,
    inputFileId: (r.inputFileId as string | null) ?? null,
    outputFileId: (r.outputFileId as string | null) ?? null,
    alternateFileId: (r.alternateFileId as string | null) ?? null,
    subtitleFileIds: JSON.parse(String(r.subtitleFileIds ?? "[]")) as string[],
    createdAt: Number(r.createdAt),
    updatedAt: Number(r.updatedAt),
    kind: String(r.kind ?? "transcode"),
    filename: String(r.filename ?? ""),
  };
}

// ---- Jobs ----
export function insertJob(job: Omit<JobRow, "updatedAt">): void {
  db.prepare(
    `INSERT INTO jobs (jobId, status, progress, error, logTail, inputFileId, outputFileId, alternateFileId, subtitleFileIds, createdAt, updatedAt, kind, filename)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    job.jobId,
    job.status,
    job.progress,
    job.error,
    job.logTail,
    job.inputFileId,
    job.outputFileId,
    job.alternateFileId,
    JSON.stringify(job.subtitleFileIds),
    job.createdAt,
    Date.now(),
    job.kind,
    job.filename,
  );
}

export function getJob(jobId: string): JobRow | null {
  const r = db
    .prepare(`SELECT * FROM jobs WHERE jobId = ?`)
    .get(jobId) as Record<string, unknown> | null;
  return r ? rowToJob(r) : null;
}

export function listJobs(): JobRow[] {
  const rows = db
    .prepare(`SELECT * FROM jobs ORDER BY createdAt DESC`)
    .all() as Record<string, unknown>[];
  return rows.map(rowToJob);
}

export function updateJob(
  jobId: string,
  patch: Partial<
    Pick<
      JobRow,
      | "status"
      | "progress"
      | "error"
      | "logTail"
      | "exitCode"
      | "alternateFileId"
      | "filename"
    >
  >,
): void {
  // Single static UPDATE: merge over the current row so partial patches
  // (incl. explicit nulls) persist exactly, with no dynamic SET builder.
  const cur = getJob(jobId);
  if (!cur || Object.keys(patch).length === 0) return;
  const next = { ...cur, ...patch };
  db.prepare(
    `UPDATE jobs SET status = ?, progress = ?, error = ?, logTail = ?, exitCode = ?, alternateFileId = ?, filename = ?, updatedAt = ? WHERE jobId = ?`,
  ).run(
    next.status,
    next.progress,
    next.error,
    next.logTail,
    next.exitCode,
    next.alternateFileId,
    next.filename,
    Date.now(),
    jobId,
  );
}

export function deleteJob(jobId: string): void {
  db.prepare(`DELETE FROM jobs WHERE jobId = ?`).run(jobId);
}

// ---- Uploads ----
export function insertUpload(u: UploadRow): void {
  db.prepare(
    `INSERT OR REPLACE INTO uploads (uploadId, filename, totalSize, received, temporaryPath, fileId, createdAt, chunks)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    u.uploadId,
    u.filename,
    u.totalSize,
    u.received,
    u.temporaryPath,
    u.fileId,
    u.createdAt,
    JSON.stringify(u.chunks),
  );
}

export function getUpload(uploadId: string): UploadRow | null {
  const r = db
    .prepare(`SELECT * FROM uploads WHERE uploadId = ?`)
    .get(uploadId) as Record<string, unknown> | null;
  if (!r) return null;
  return {
    uploadId: String(r.uploadId),
    filename: String(r.filename),
    totalSize: Number(r.totalSize),
    received: Number(r.received),
    temporaryPath: String(r.temporaryPath),
    fileId: (r.fileId as string | null) ?? null,
    createdAt: Number(r.createdAt),
    chunks: JSON.parse(String(r.chunks ?? "[]")) as number[],
  };
}

export function updateUpload(
  uploadId: string,
  patch: Partial<Pick<UploadRow, "received" | "chunks">>,
): void {
  // Single static UPDATE over the merged row — no dynamic SET builder.
  if (patch.received === undefined && patch.chunks === undefined) return;
  const cur = getUpload(uploadId);
  if (!cur) return;
  db.prepare(
    `UPDATE uploads SET received = ?, chunks = ? WHERE uploadId = ?`,
  ).run(
    patch.received ?? cur.received,
    JSON.stringify(patch.chunks ?? cur.chunks),
    uploadId,
  );
}

export function deleteUpload(uploadId: string): void {
  db.prepare(`DELETE FROM uploads WHERE uploadId = ?`).run(uploadId);
}

export function listUploads(): UploadRow[] {
  const rows = db.prepare(`SELECT * FROM uploads`).all() as Record<
    string,
    unknown
  >[];
  return rows.map((r) => ({
    uploadId: String(r.uploadId),
    filename: String(r.filename),
    totalSize: Number(r.totalSize),
    received: Number(r.received),
    temporaryPath: String(r.temporaryPath),
    fileId: (r.fileId as string | null) ?? null,
    createdAt: Number(r.createdAt),
    chunks: JSON.parse(String(r.chunks ?? "[]")) as number[],
  }));
}

/** Absolute store paths of live upload sessions (pinned across sweeps). */
export function liveUploadPaths(): Set<string> {
  return new Set(listUploads().map((u) => u.temporaryPath));
}

// ---- Startup sweep ----
// Marks interrupted jobs as failed and removes stale uploads (>6h).
// Runs once at boot.
export function startupSweep(): {
  recoveredJobs: number;
  deletedFiles: number;
} {
  let recoveredJobs = 0;
  let deletedFiles = 0;
  const rm = (p: string) => {
    try {
      fs.unlinkSync(p);
      deletedFiles++;
    } catch {}
  };

  for (const job of listJobs()) {
    if (job.status === "processing" || job.status === "queued") {
      // Partial outputs stay owned by the failed row (freed on job delete).
      updateJob(job.jobId, {
        status: "failed",
        error: "Server restarted before export completed.",
      });
      recoveredJobs++;
    }
  }

  const cutoff = Date.now() - 6 * 60 * 60 * 1000;
  for (const u of listUploads()) {
    if (u.createdAt < cutoff) {
      rm(u.temporaryPath);
      deleteUpload(u.uploadId);
    }
  }

  return { recoveredJobs, deletedFiles };
}
