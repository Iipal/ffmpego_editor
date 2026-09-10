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
  /** Opaque AssetStore/ArtifactStore IDs — the only file references. */
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
  /** Owning AssetStore record for the pre-allocated session file. */
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
  createdAt INTEGER NOT NULL,
  chunks TEXT NOT NULL DEFAULT '[]'
);
`);

// B4: numeric ffmpeg exit code (null while pending / spawn failure).
// ALTER TABLE has no IF NOT EXISTS — guard via PRAGMA so restarts don't crash.
function ensureColumn(table: string, column: string, ddl: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as {
    name: string;
  }[];
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl};`);
  }
}
ensureColumn("jobs", "exitCode", "INTEGER");
// AssetStore/ArtifactStore ownership (opaque file IDs).
ensureColumn("jobs", "inputFileId", "TEXT");
ensureColumn("jobs", "outputFileId", "TEXT");
ensureColumn("jobs", "alternateFileId", "TEXT");
ensureColumn("jobs", "subtitleFileIds", "TEXT DEFAULT '[]'");
ensureColumn("uploads", "fileId", "TEXT");

// Dropped: pre-AssetStore path-mirror columns (outputPath,
// alternateOutputPath, temporaryInputPath, subtitlePaths). Files are
// referenced by store ID only; jobs table is empty-or-migrated in practice
// (local dev data), so legacy rows lose their path mirrors here.
function dropColumn(table: string, column: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as {
    name: string;
  }[];
  if (cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} DROP COLUMN ${column};`);
  }
}
dropColumn("jobs", "outputPath");
dropColumn("jobs", "alternateOutputPath");
dropColumn("jobs", "temporaryInputPath");
dropColumn("jobs", "subtitlePaths");

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
  const sets: string[] = [];
  const vals: (string | number | null)[] = [];
  if (patch.status !== undefined) {
    sets.push("status = ?");
    vals.push(patch.status);
  }
  if (patch.progress !== undefined) {
    sets.push("progress = ?");
    vals.push(patch.progress);
  }
  if (patch.error !== undefined) {
    sets.push("error = ?");
    vals.push(patch.error);
  }
  if (patch.logTail !== undefined) {
    sets.push("logTail = ?");
    vals.push(patch.logTail);
  }
  if (patch.exitCode !== undefined) {
    sets.push("exitCode = ?");
    vals.push(patch.exitCode);
  }
  if (patch.alternateFileId !== undefined) {
    sets.push("alternateFileId = ?");
    vals.push(patch.alternateFileId);
  }
  if (patch.filename !== undefined) {
    sets.push("filename = ?");
    vals.push(patch.filename);
  }
  if (!sets.length) return;
  sets.push("updatedAt = ?");
  vals.push(Date.now());
  vals.push(jobId);
  db.prepare(`UPDATE jobs SET ${sets.join(", ")} WHERE jobId = ?`).run(...vals);
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
  const sets: string[] = [];
  const vals: (string | number)[] = [];
  if (patch.received !== undefined) {
    sets.push("received = ?");
    vals.push(patch.received);
  }
  if (patch.chunks !== undefined) {
    sets.push("chunks = ?");
    vals.push(JSON.stringify(patch.chunks));
  }
  if (!sets.length) return;
  vals.push(uploadId);
  db.prepare(`UPDATE uploads SET ${sets.join(", ")} WHERE uploadId = ?`).run(
    ...vals,
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
