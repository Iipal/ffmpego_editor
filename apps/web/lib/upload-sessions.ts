// Upload-session service: orphan visibility + abort + resume memory for the
// local Hono API's `/api/upload/*` session pipeline.
//
// Server side (`apps/api/src/routes/upload.ts`):
// - `GET /upload/sessions` lists open sessions (no list existed before — an
//   abandoned upload was invisible until the 6h server sweep).
// - `GET /upload/status/:uploadId` reports `{received, percent, chunks}` —
//   `chunks` is the received-index skip-set the chunked uploader resumes from.
// - `DELETE /upload/:uploadId` aborts a session (refcount-aware: bytes a live
//   job holds are never deleted).
//
// Client side: `uploadChunked.uploadFile` remembers each fresh session in
// `localStorage` (uploadId + file identity + chunk size). When the same file
// is uploaded again, the uploader verifies the session via status and skips
// already-received chunks instead of starting over. TanStack Query wiring
// lives in `hooks/useUploadSessions.ts`; rendering lives in
// `components/admin/UploadSessions.tsx`.
import { apiClient } from "./api-client";

/** One open upload session from `GET /api/upload/sessions`. */
export interface UploadSession {
  uploadId: string;
  filename: string;
  totalSize: number;
  received: number;
  percent: number;
  createdAt: number;
  ageSeconds: number;
  assetId: string | null;
}

/** Progress snapshot from `GET /api/upload/status/:uploadId`. */
export interface UploadSessionStatus {
  uploadId: string;
  filename: string;
  totalSize: number;
  received: number;
  percent: number;
  /** Received chunk indices — authoritative resume skip-set. */
  chunks: number[];
  assetId: string | null;
}

/** Remembered session for transparent resume across page reloads. */
interface RememberedSession {
  uploadId: string;
  name: string;
  size: number;
  lastModified: number;
  chunkSize: number;
  rememberedAt: number;
}

/**
 * Singleton service owning upload-session reads/aborts plus the resume
 * memory. Server calls fail fast with human messages (same shaping as
 * `lib/storage.ts`); the memory helpers never throw (storage may be
 * unavailable — resume is best-effort, uploads must never fail because of it).
 */
class UploadSessions {
  /** Default timeout for session calls (fail fast, don't hang). */
  private static readonly DEFAULT_TIMEOUT_MS = 8000;
  private static readonly MEMORY_KEY = "ffmpeg-editor.upload-resume";
  /** Remembered sessions older than this are dropped (server sweeps at 6h). */
  private static readonly MEMORY_TTL_MS = 6 * 60 * 60 * 1000;

  /** List open sessions, newest first. Throws with a human message. */
  async listSessions(
    timeoutMs = UploadSessions.DEFAULT_TIMEOUT_MS,
  ): Promise<UploadSession[]> {
    const baseUrl = apiClient.baseUrl;
    if (!baseUrl) throw new Error("API base URL not configured");
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(apiClient.url("/api/upload/sessions"), {
        signal: ctrl.signal,
      });
      if (!res.ok) {
        throw new Error(`Upload sessions responded with HTTP ${res.status}.`);
      }
      const body = (await res.json()) as { sessions?: UploadSession[] };
      return body.sessions ?? [];
    } catch (e) {
      if ((e as Error)?.name === "AbortError") {
        throw new Error(
          `Upload sessions timed out — is the backend running on ${baseUrl}?`,
        );
      }
      if (e instanceof Error) {
        if (e.message.startsWith("Upload sessions responded")) throw e;
        throw new Error(
          `API unreachable — is the backend running on ${baseUrl}?`,
        );
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Fetch one session's progress. Returns `null` when the session is gone
   * (404 — swept, aborted, or never existed) so callers fall back to a
   * fresh upload; throws on other failures.
   */
  async fetchStatus(
    uploadId: string,
    timeoutMs = UploadSessions.DEFAULT_TIMEOUT_MS,
  ): Promise<UploadSessionStatus | null> {
    const baseUrl = apiClient.baseUrl;
    if (!baseUrl) throw new Error("API base URL not configured");
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(apiClient.url(`/api/upload/status/${uploadId}`), {
        signal: ctrl.signal,
      });
      if (res.status === 404) return null;
      if (!res.ok) {
        throw new Error(`Upload status responded with HTTP ${res.status}.`);
      }
      return (await res.json()) as UploadSessionStatus;
    } catch (e) {
      if ((e as Error)?.name === "AbortError") {
        throw new Error(
          `Upload status timed out — is the backend running on ${baseUrl}?`,
        );
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Abort a session server-side. Resolves when the bytes are released. */
  async abortSession(
    uploadId: string,
    timeoutMs = UploadSessions.DEFAULT_TIMEOUT_MS,
  ): Promise<void> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      await apiClient.delete(`/api/upload/${uploadId}`, {
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    this.forget(uploadId);
  }

  /**
   * Remember a fresh session so a later upload of the same file can resume
   * it. Keyed by file identity (name + size + lastModified) — a different
   * file never resumes another file's bytes.
   */
  remember(file: File, uploadId: string, chunkSize: number): void {
    try {
      const all = this.readMemory().filter(
        (r) => Date.now() - r.rememberedAt < UploadSessions.MEMORY_TTL_MS,
      );
      const entry: RememberedSession = {
        uploadId,
        name: file.name,
        size: file.size,
        lastModified: file.lastModified,
        chunkSize,
        rememberedAt: Date.now(),
      };
      const rest = all.filter((r) => !this.sameFile(r, file));
      rest.push(entry);
      localStorage.setItem(
        UploadSessions.MEMORY_KEY,
        JSON.stringify(rest.slice(-10)),
      );
    } catch (e) {
      console.warn("[upload-sessions] remember failed:", e);
    }
  }

  /** Look up a remembered session for this exact file, if any. */
  lookup(file: File): RememberedSession | null {
    try {
      const hit = this.readMemory().find((r) => this.sameFile(r, file));
      if (!hit) return null;
      if (Date.now() - hit.rememberedAt >= UploadSessions.MEMORY_TTL_MS) {
        this.forget(hit.uploadId);
        return null;
      }
      return hit;
    } catch (e) {
      console.warn("[upload-sessions] lookup failed:", e);
      return null;
    }
  }

  /** Drop a remembered session (completed, aborted, or swept server-side). */
  forget(uploadId: string): void {
    try {
      const rest = this.readMemory().filter((r) => r.uploadId !== uploadId);
      localStorage.setItem(UploadSessions.MEMORY_KEY, JSON.stringify(rest));
    } catch (e) {
      console.warn("[upload-sessions] forget failed:", e);
    }
  }

  private sameFile(r: RememberedSession, file: File): boolean {
    return (
      r.name === file.name &&
      r.size === file.size &&
      r.lastModified === file.lastModified
    );
  }

  private readMemory(): RememberedSession[] {
    try {
      const raw = localStorage.getItem(UploadSessions.MEMORY_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? (parsed as RememberedSession[]) : [];
    } catch {
      return [];
    }
  }
}

/** App-wide singleton — uploader + Query hooks go through this. */
export const uploadSessions = new UploadSessions();
