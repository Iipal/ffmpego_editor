/**
 * File lifecycle for every temp file — one store object, role on reserve().
 *
 * Roles travel with the record (`asset` inputs: upload/request-input;
 * `artifact` outputs: output/alternate-output/subtitle-png/ephemeral) at
 * `<tmp>/ffmpeg_editor_store/<id>.<ext>`, each kind carrying its TTL default
 * and every reserve gated by the quota (throws FileStoreQuotaError → 507).
 *
 * `asset` inputs: upload/request-input; `artifact` outputs:
 * output/alternate-output/subtitle-png/ephemeral. All routes use the
 * top-level unified store directly.
 *
 * Every record carries: opaque id, role, kind, owner job, reference count,
 * byte size, MIME/extension, display name, creation time, and expiration.
 * The database record is created BEFORE any bytes are written, so a failed
 * or crashed request can never leave an untracked file behind.
 *
 * Rules:
 * - All managed files live under a single store root (`<tmp>/ffmpeg_editor_store/`)
 *   as `<fileId>.<ext>` — safe by construction, never user-controlled names.
 * - Absolute paths never leave this module: API responses get descriptors
 *   (id/name/size/mime), downloads resolve the path internally by ID.
 * - `release()` is idempotent: unknown ids and missing files are logged
 *   no-ops, never errors. Reconciliation is a pure function of
 *   (DB rows × store-root listing) — no filename regexes.
 * - Job-owned files are exempt from expiration (keep-until-delete); they die
 *   only via explicit `release()` on job delete.
 */
import type { Database } from "bun:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type FileRole = "asset" | "artifact";
export type FileKind =
  | "upload"
  | "request-input"
  | "output"
  | "alternate-output"
  | "subtitle-png"
  | "ephemeral";
export type FileStatus = "reserved" | "active";

export interface FileRecord {
  id: string;
  role: FileRole;
  kind: FileKind;
  /** Primary owning job (first attacher). Informational + expiry exemption. */
  ownerJobId: string | null;
  /** Sessions/jobs sharing this file (chunked upload reused by transcode). */
  refCount: number;
  /** Absolute path — server-internal only, never serialized to clients. */
  path: string;
  byteSize: number;
  mime: string;
  ext: string;
  /** Sanitized display name (no path separators). */
  name: string;
  status: FileStatus;
  createdAt: number;
  updatedAt: number;
  /** Null = keep until explicitly released (job-owned outputs). */
  expiresAt: number | null;
}

/** Public descriptor — the only shape API responses may expose. */
export interface FileDescriptor {
  id: string;
  role: FileRole;
  kind: FileKind;
  name: string;
  byteSize: number;
  mime: string;
  ext: string;
  createdAt: number;
  expiresAt: number | null;
}

export interface ReserveOptions {
  role: FileRole;
  kind: FileKind;
  /** Original client filename — sanitized for display name + extension only. */
  filename: string;
  mime?: string;
  ownerJobId?: string;
  /** Null = keep until released. Undefined = role default. */
  ttlMs?: number | null;
  /** Declared byte size for the quota gate (0 = unknown). */
  sizeHint?: number;
}

export interface ReleaseResult {
  id: string;
  /** True when bytes were actually freed by this call. */
  deleted: boolean;
  bytesFreed: number;
  /** True when the record was already gone (idempotent no-op). */
  alreadyGone: boolean;
  refCount: number;
}

export interface SweepResult {
  expired: number;
  staleReserved: number;
  missing: number;
  orphans: number;
  bytesFreed: number;
}

export class FileStoreError extends Error {}
export class FileStoreQuotaError extends FileStoreError {
  neededBytes: number;
  quotaBytes: number;
  constructor(neededBytes: number, quotaBytes: number) {
    super(
      `Storage quota exceeded: need ${neededBytes} bytes, quota is ${quotaBytes} bytes`,
    );
    this.neededBytes = neededBytes;
    this.quotaBytes = quotaBytes;
  }
}

/** Expiration policy per kind when the caller passes no explicit ttl. */
export const UPLOAD_TTL_MS = 6 * 60 * 60 * 1000;
export const REQUEST_INPUT_TTL_MS = 60 * 60 * 1000;
export const EPHEMERAL_TTL_MS = 5 * 60 * 1000;
/** A `reserved` row with no owner older than this never finished writing. */
export const RESERVED_STALE_MS = 2 * 60 * 60 * 1000;
/** In-flight `.part` files younger than this are left alone by reconcile. */
export const PART_GRACE_MS = 60 * 60 * 1000;

const KIND_DEFAULT_TTL: Record<FileKind, number | null> = {
  upload: UPLOAD_TTL_MS,
  "request-input": REQUEST_INPUT_TTL_MS,
  output: null,
  "alternate-output": null,
  "subtitle-png": null,
  ephemeral: EPHEMERAL_TTL_MS,
};

const SAFE_NAME_RE = /[^a-zA-Z0-9._-]/g;

/** Centralized safe filename: basename, unsafe chars → `_`, length-capped. */
export function safeFilename(name: string, fallback = "file"): string {
  const base = path.basename(name || "").replace(SAFE_NAME_RE, "_");
  const trimmed = base.replace(/^\.+/, "").slice(0, 128);
  return trimmed || fallback;
}

/** Lowercase alphanumeric extension, `bin` when absent/unusable. */
export function extOf(filename: string): string {
  const base = safeFilename(filename);
  const dot = base.lastIndexOf(".");
  if (dot < 0) return "bin";
  const ext = base.slice(dot + 1).toLowerCase();
  return /^[a-z0-9]{1,10}$/.test(ext) ? ext : "bin";
}

const MIME_BY_EXT: Record<string, string> = {
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  mkv: "video/x-matroska",
  m4v: "video/x-m4v",
  avi: "video/x-msvideo",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  wav: "audio/wav",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  ogg: "audio/ogg",
  srt: "text/plain",
  vtt: "text/vtt",
};

/** Centralized MIME mapping — one place decides Content-Type for downloads. */
export function mimeForExt(ext: string): string {
  return MIME_BY_EXT[ext.toLowerCase()] ?? "application/octet-stream";
}

function newId(role: FileRole): string {
  const rand = crypto.randomUUID().replace(/-/g, "");
  return `${role === "asset" ? "ast" : "art"}_${rand}`;
}

export interface FileStoreOptions {
  root?: string;
  quotaBytes?: number;
  /**
   * Liveness probe for owner jobs (wired to getJob by the singleton).
   * Lets expiry reap files whose owner job row is gone. Defaults to
   * "alive" (conservative: never expire job-owned files).
   */
  isJobAlive?: (jobId: string) => boolean;
}

export function defaultStoreRoot(): string {
  return path.join(os.tmpdir(), "ffmpeg_editor_store");
}

export const DEFAULT_QUOTA_BYTES = 50 * 1024 * 1024 * 1024;

export function createFileStore(
  database: Database,
  opts: FileStoreOptions = {},
) {
  const root = opts.root ?? defaultStoreRoot();
  const quotaBytes = opts.quotaBytes ?? DEFAULT_QUOTA_BYTES;
  const isJobAlive = opts.isJobAlive ?? (() => true);
  fs.mkdirSync(root, { recursive: true });

  database.exec(`
    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      role TEXT NOT NULL,
      kind TEXT NOT NULL,
      ownerJobId TEXT,
      refCount INTEGER NOT NULL DEFAULT 1,
      path TEXT NOT NULL,
      byteSize INTEGER NOT NULL DEFAULT 0,
      mime TEXT NOT NULL DEFAULT 'application/octet-stream',
      ext TEXT NOT NULL DEFAULT 'bin',
      name TEXT NOT NULL DEFAULT 'file',
      status TEXT NOT NULL DEFAULT 'reserved',
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      expiresAt INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_files_owner ON files(ownerJobId);
    CREATE INDEX IF NOT EXISTS idx_files_expires ON files(expiresAt);
  `);

  function rowToRecord(r: Record<string, unknown>): FileRecord {
    return {
      id: String(r.id),
      role: r.role as FileRole,
      kind: r.kind as FileKind,
      ownerJobId: (r.ownerJobId as string | null) ?? null,
      refCount: Number(r.refCount ?? 1),
      path: String(r.path),
      byteSize: Number(r.byteSize ?? 0),
      mime: String(r.mime ?? "application/octet-stream"),
      ext: String(r.ext ?? "bin"),
      name: String(r.name ?? "file"),
      status: (r.status as FileStatus) ?? "reserved",
      createdAt: Number(r.createdAt),
      updatedAt: Number(r.updatedAt),
      expiresAt:
        r.expiresAt === null || r.expiresAt === undefined
          ? null
          : Number(r.expiresAt),
    };
  }

  function describe(r: FileRecord): FileDescriptor {
    return {
      id: r.id,
      role: r.role,
      kind: r.kind,
      name: r.name,
      byteSize: r.byteSize,
      mime: r.mime,
      ext: r.ext,
      createdAt: r.createdAt,
      expiresAt: r.expiresAt,
    };
  }

  function get(id: string): FileRecord | null {
    const r = database
      .prepare(`SELECT * FROM files WHERE id = ?`)
      .get(id) as Record<string, unknown> | null;
    return r ? rowToRecord(r) : null;
  }

  function managedBytes(): number {
    const r = database
      .prepare(`SELECT COALESCE(SUM(byteSize), 0) AS total FROM files`)
      .get() as { total: number };
    return Number(r.total ?? 0);
  }

  function unlinkBestEffort(p: string): { freed: boolean; bytes: number } {
    let bytes = 0;
    try {
      bytes = fs.statSync(p).size;
    } catch {
      return { freed: false, bytes: 0 };
    }
    try {
      fs.unlinkSync(p);
      return { freed: true, bytes };
    } catch {
      return { freed: false, bytes: 0 };
    }
  }

  function deleteRow(id: string): void {
    database.prepare(`DELETE FROM files WHERE id = ?`).run(id);
  }

  /**
   * Reserve a record BEFORE writing bytes — a crashed/failed request leaves
   * a tracked `reserved` row (reaped by sweep/reconcile), never a stray file.
   * Throws FileStoreQuotaError when sizeHint breaches the quota gate.
   */
  function reserve(o: ReserveOptions): { id: string; path: string } {
    const sizeHint = Math.max(0, Math.floor(o.sizeHint ?? 0));
    if (managedBytes() + sizeHint > quotaBytes) {
      throw new FileStoreQuotaError(sizeHint, quotaBytes);
    }
    const id = newId(o.role);
    const ext = extOf(o.filename);
    const filePath = path.join(root, `${id}.${ext}`);
    const now = Date.now();
    const ttl = o.ttlMs === undefined ? KIND_DEFAULT_TTL[o.kind] : o.ttlMs;
    database
      .prepare(
        `INSERT INTO files (id, role, kind, ownerJobId, refCount, path, byteSize, mime, ext, name, status, createdAt, updatedAt, expiresAt)
         VALUES (?, ?, ?, ?, 1, ?, 0, ?, ?, ?, 'reserved', ?, ?, ?)`,
      )
      .run(
        id,
        o.role,
        o.kind,
        o.ownerJobId ?? null,
        filePath,
        o.mime ?? mimeForExt(ext),
        ext,
        safeFilename(o.filename),
        now,
        now,
        ttl == null ? null : now + ttl,
      );
    return { id, path: filePath };
  }

  /** Mark a reserved record complete, recording its real byte size. */
  function finalize(id: string, byteSize?: number): FileRecord | null {
    const rec = get(id);
    if (!rec) return null;
    let size = byteSize;
    if (size === undefined) {
      try {
        size = fs.statSync(rec.path).size;
      } catch {
        return rec;
      }
    }
    database
      .prepare(
        `UPDATE files SET status = 'active', byteSize = ?, updatedAt = ? WHERE id = ?`,
      )
      .run(Math.max(0, Math.floor(size)), Date.now(), id);
    return get(id);
  }

  /** Best-effort size refresh (downloads/stats reconcile drift). */
  function syncSize(id: string): number | null {
    const rec = get(id);
    if (!rec) return null;
    try {
      const size = fs.statSync(rec.path).size;
      database
        .prepare(`UPDATE files SET byteSize = ?, updatedAt = ? WHERE id = ?`)
        .run(size, Date.now(), id);
      return size;
    } catch {
      return null;
    }
  }

  /**
   * Share a session-owned file with a job: adds a reference so session
   * cleanup can't delete bytes a live job is rendering. First share also
   * records the owner (exempting the file from expiration while the job
   * row exists).
   */
  function share(id: string, jobId: string): FileRecord | null {
    const rec = get(id);
    if (!rec) return null;
    if (rec.ownerJobId === jobId) return rec;
    database
      .prepare(
        `UPDATE files SET ownerJobId = COALESCE(ownerJobId, ?), refCount = refCount + 1, updatedAt = ? WHERE id = ?`,
      )
      .run(jobId, Date.now(), id);
    return get(id);
  }

  /** Bump updatedAt so slow-but-live sessions aren't reaped as stale. */
  function touch(id: string): void {
    database
      .prepare(`UPDATE files SET updatedAt = ? WHERE id = ?`)
      .run(Date.now(), id);
  }

  /**
   * Release one reference; deletes bytes + row at zero. Idempotent:
   * unknown ids and already-missing files return `{ alreadyGone: true }`
   * instead of throwing, so double-delete and crash-replay are safe.
   */
  function release(id: string): ReleaseResult {
    const rec = get(id);
    if (!rec)
      return {
        id,
        deleted: false,
        bytesFreed: 0,
        alreadyGone: true,
        refCount: 0,
      };
    if (rec.refCount > 1) {
      database
        .prepare(
          `UPDATE files SET refCount = refCount - 1, updatedAt = ? WHERE id = ?`,
        )
        .run(Date.now(), id);
      return {
        id,
        deleted: false,
        bytesFreed: 0,
        alreadyGone: false,
        refCount: rec.refCount - 1,
      };
    }
    const { bytes } = unlinkBestEffort(rec.path);
    deleteRow(id);
    return {
      id,
      deleted: true,
      bytesFreed: bytes,
      alreadyGone: false,
      refCount: 0,
    };
  }

  function releaseAll(ids: readonly string[]): {
    released: number;
    alreadyGone: number;
    bytesFreed: number;
  } {
    let released = 0;
    let alreadyGone = 0;
    let bytesFreed = 0;
    for (const id of ids) {
      if (!id) {
        alreadyGone++;
        continue;
      }
      const r = release(id);
      if (r.alreadyGone) alreadyGone++;
      else if (r.deleted) {
        released++;
        bytesFreed += r.bytesFreed;
      }
    }
    return { released, alreadyGone, bytesFreed };
  }

  /**
   * Atomic write: bytes land on a `.part` sibling then rename into place,
   * so readers never observe a half-written file. Finalizes the record.
   */
  async function writeAtomic(
    id: string,
    data: Uint8Array | ArrayBuffer | string,
  ): Promise<FileRecord | null> {
    const rec = get(id);
    if (!rec) return null;
    const part = `${rec.path}.part-${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
    await Bun.write(part, data as never);
    fs.renameSync(part, rec.path);
    return finalize(id);
  }

  /**
   * Expire files past `expiresAt` whose owner is gone (unowned, or owned by
   * a deleted job) + ownerless `reserved` rows that never finished writing
   * (crashed between reserve and finalize). Live job-owned files are never
   * touched — keep-until-delete.
   */
  function sweepExpired(
    now: number = Date.now(),
    pinned: Set<string> = new Set(),
  ): SweepResult {
    const out: SweepResult = {
      expired: 0,
      staleReserved: 0,
      missing: 0,
      orphans: 0,
      bytesFreed: 0,
    };
    const expired = database
      .prepare(
        `SELECT id, ownerJobId FROM files WHERE expiresAt IS NOT NULL AND expiresAt < ?`,
      )
      .all(now) as Array<{ id: string; ownerJobId: string | null }>;
    for (const { id, ownerJobId } of expired) {
      if (ownerJobId !== null && isJobAlive(ownerJobId)) continue;
      const r = release(id);
      out.expired++;
      out.bytesFreed += r.bytesFreed;
    }
    const staleCutoff = now - RESERVED_STALE_MS;
    const stale = database
      .prepare(
        `SELECT id, path, ownerJobId, updatedAt FROM files WHERE status = 'reserved' AND updatedAt < ?`,
      )
      .all(staleCutoff) as Array<{
      id: string;
      path: string;
      ownerJobId: string | null;
      updatedAt: number;
    }>;
    for (const { id, path: p, ownerJobId } of stale) {
      // A reserved row owned by a live job is mid-render (ffmpeg writes
      // directly to the reserved path) — only reap when ownerless/dead.
      // `pinned` (below) additionally shields slow-but-live upload sessions.
      if (ownerJobId !== null && isJobAlive(ownerJobId)) continue;
      if (pinned.has(p)) continue;
      const { bytes } = unlinkBestEffort(p);
      deleteRow(id);
      out.staleReserved++;
      out.bytesFreed += bytes;
    }
    return out;
  }

  /**
   * Startup reconciliation — pure function of (DB rows × store-root listing):
   * expired/stale rows, rows whose bytes vanished (wiped tmp), and store-root
   * files with no owning row (crash orphans). No filename regexes.
   * Idempotent: a second run finds nothing and frees zero bytes.
   */
  function reconcile(
    now: number = Date.now(),
    opts: { pin?: Set<string> } = {},
  ): SweepResult {
    const pinned = opts.pin ?? new Set<string>();
    const out = sweepExpired(now, pinned);

    for (const rec of (
      database.prepare(`SELECT * FROM files`).all() as Record<string, unknown>[]
    ).map(rowToRecord)) {
      try {
        fs.accessSync(rec.path);
      } catch {
        deleteRow(rec.id);
        out.missing++;
      }
    }

    const owned = new Set(
      (
        database.prepare(`SELECT path FROM files`).all() as Array<{
          path: string;
        }>
      ).map((r) => r.path),
    );
    let entries: string[] = [];
    try {
      entries = fs.readdirSync(root);
    } catch {
      return out;
    }
    for (const f of entries) {
      const full = path.join(root, f);
      if (owned.has(full) || pinned.has(full)) continue;
      let stat: fs.Stats | null = null;
      try {
        stat = fs.statSync(full);
      } catch {
        continue;
      }
      if (!stat.isFile()) continue;
      // In-flight atomic writes are `<id>.<ext>.part-*`; leave young ones.
      if (f.includes(".part-") && now - stat.mtimeMs < PART_GRACE_MS) continue;
      const { bytes } = unlinkBestEffort(full);
      out.orphans++;
      out.bytesFreed += bytes;
    }
    return out;
  }

  function stats(): {
    files: number;
    bytes: number;
    quotaBytes: number;
    byRole: Record<string, number>;
    byKind: Record<string, number>;
  } {
    const rows = database
      .prepare(
        `SELECT role, kind, COALESCE(SUM(byteSize), 0) AS bytes, COUNT(*) AS n FROM files GROUP BY role, kind`,
      )
      .all() as Array<{ role: string; kind: string; bytes: number; n: number }>;
    const byRole: Record<string, number> = {};
    const byKind: Record<string, number> = {};
    let files = 0;
    let bytes = 0;
    for (const r of rows) {
      files += r.n;
      bytes += r.bytes;
      byRole[r.role] = (byRole[r.role] ?? 0) + r.n;
      byKind[r.kind] = (byKind[r.kind] ?? 0) + r.n;
    }
    return { files, bytes, quotaBytes, byRole, byKind };
  }

  // Single store object — role travels on reserve(), kinds carry TTL
  // defaults, reserve() is the quota gate.
  function describeById(id: string): FileDescriptor | null {
    const rec = get(id);
    return rec ? describe(rec) : null;
  }

  const api = {
    reserve,
    finalize,
    syncSize,
    share,
    touch,
    release,
    releaseAll,
    get,
    describe: describeById,
    writeAtomic,
    sweepExpired,
    reconcile,
    stats,
    managedBytes,
  };

  return {
    root,
    quotaBytes,
    ...api,
  };
}

export type FileStore = ReturnType<typeof createFileStore>;
