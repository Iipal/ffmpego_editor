import { Database } from "bun:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type JobStatus =
  | "queued"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

export interface JobRow {
  jobId: string;
  status: JobStatus;
  progress: number;
  outputPath: string;
  alternateOutputPath: string | null;
  error: string | null;
  logTail: string | null;
  exitCode: number | null;
  temporaryInputPath: string;
  subtitlePaths: string[];
  /** Opaque AssetStore/ArtifactStore IDs. Path columns are write-mirrors kept
   *  for crash-time readability; all live file access goes through the IDs. */
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
  outputPath TEXT NOT NULL,
  alternateOutputPath TEXT,
  error TEXT,
  logTail TEXT,
  temporaryInputPath TEXT NOT NULL,
  subtitlePaths TEXT NOT NULL DEFAULT '[]',
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
// AssetStore/ArtifactStore ownership (opaque file IDs; path cols stay as mirrors).
ensureColumn("jobs", "inputFileId", "TEXT");
ensureColumn("jobs", "outputFileId", "TEXT");
ensureColumn("jobs", "alternateFileId", "TEXT");
ensureColumn("jobs", "subtitleFileIds", "TEXT DEFAULT '[]'");
ensureColumn("uploads", "fileId", "TEXT");

function rowToJob(r: Record<string, unknown>): JobRow {
  return {
    jobId: String(r.jobId),
    status: r.status as JobStatus,
    progress: Number(r.progress ?? 0),
    outputPath: String(r.outputPath),
    alternateOutputPath: (r.alternateOutputPath as string | null) ?? null,
    error: (r.error as string | null) ?? null,
    logTail: (r.logTail as string | null) ?? null,
    exitCode: (r.exitCode as number | null) ?? null,
    temporaryInputPath: String(r.temporaryInputPath),
    subtitlePaths: JSON.parse(String(r.subtitlePaths ?? "[]")) as string[],
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
    `INSERT INTO jobs (jobId, status, progress, outputPath, alternateOutputPath, error, logTail, temporaryInputPath, subtitlePaths, inputFileId, outputFileId, alternateFileId, subtitleFileIds, createdAt, updatedAt, kind, filename)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    job.jobId,
    job.status,
    job.progress,
    job.outputPath,
    job.alternateOutputPath,
    job.error,
    job.logTail,
    job.temporaryInputPath,
    JSON.stringify(job.subtitlePaths),
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
      | "alternateOutputPath"
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
  if (patch.alternateOutputPath !== undefined) {
    sets.push("alternateOutputPath = ?");
    vals.push(patch.alternateOutputPath);
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

// ---- Startup sweep ----
// Marks interrupted jobs as failed, deletes partial outputs, removes stale
// uploads (>6h) and orphan temp files. Runs once at boot.
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
      // Partial output from killed ffmpeg can never be resumed — delete it.
      if (job.outputPath) rm(job.outputPath);
      if (job.alternateOutputPath) rm(job.alternateOutputPath);
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

  // Sweep orphan temp files older than 24h (crash leftovers with no DB row).
  try {
    const day = 24 * 60 * 60 * 1000;
    const now = Date.now();
    for (const f of fs.readdirSync(os.tmpdir())) {
      const isTempOut = f.startsWith("temp_") && /\.(mp4|webm|mov)$/i.test(f);
      const isSubPng = /-sub\d+\.png$/.test(f);
      const isJobInput =
        /^[0-9a-f-]{36}-/.test(f) && /\.(mp4|webm|mov|mkv|png)$/i.test(f);
      if (!(isTempOut || isSubPng || isJobInput)) continue;
      const full = path.join(os.tmpdir(), f);
      try {
        const age = now - fs.statSync(full).mtimeMs;
        if (age > day) rm(full);
      } catch {}
    }
  } catch {}

  return { recoveredJobs, deletedFiles };
}
