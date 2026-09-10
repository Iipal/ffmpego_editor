// Audio upload-reuse service: one chunked upload serves analysis + previews
// + extracts instead of re-sending the same bytes per call.
//
// Backend side (`apps/api/src/routes/audio.ts:resolveInput`) already accepts
// `x-upload-id`, and `consumeUpload` (`routes/upload.ts`) is non-destructive —
// upload rows persist in SQLite, so the same uploadId can be consumed
// repeatedly (analysis, N preview pulls, extract). The web side just never
// used it: every audio call POSTed a fresh raw `FormData{file}`.
//
// `audioUpload.ensureTransport` resolves `{uploadId}` once per file (>256 MB
// via `shouldUseChunked`, matching the export pipeline threshold) and caches
// the *completed* uploadId by file identity (name + size + lastModified).
// Reuse is validated cheaply via `GET /upload/status` (row alive, sizes
// match, fully received); swept/aborted sessions fall back to a fresh upload.
// Concurrent ensures for the same file share one in-flight upload. Small
// files resolve `{uploadId: null}` — callers keep the direct FormData path.
//
// The one-shot `postJson`/`postBlob` helpers POST header-only (settings-only,
// never the double-send `FormData{file}` + `x-upload-id` from TODO item E)
// when a transport id exists, and evict + retry once on FILE_REQUIRED (the
// freak case where the DB row outlived the tmp bytes). The `*With` variants
// take a pre-resolved transport so fan-outs (one preview pull per enabled
// track) share a single ensure.
import { apiClient } from "./api-client";
import { uploadChunked } from "./upload-chunked";
import { uploadSessions } from "./upload-sessions";

/** Resolved upload transport for one file: id reuse or direct FormData. */
export interface AudioTransport {
  /** Chunked session to reference via `x-upload-id`, or null for direct. */
  uploadId: string | null;
}

/** Progress/signal knobs for the audio upload helpers. */
export interface AudioUploadOptions {
  signal?: AbortSignal;
}

/**
 * Singleton service owning audio upload reuse across analysis, preview and
 * extract calls. Page-session caches only (a reload re-uploads) — the bytes
 * stay server-side under the completed session until the 6h server sweep.
 */
class AudioUpload {
  /** Completed uploadIds by file identity (name|size|lastModified). */
  private readonly completedByFile = new Map<string, string>();
  /** In-flight ensures by file identity so parallel calls share one upload. */
  private readonly pendingByFile = new Map<string, Promise<string>>();

  /**
   * Resolve the transport for `file`: a validated cached uploadId, a fresh
   * chunked upload (cached for later calls), or `{uploadId: null}` for small
   * files that keep the direct FormData path. Never rejects on stale cache —
   * falls back to a fresh upload.
   */
  async ensureTransport(
    file: File,
    opts: AudioUploadOptions = {},
  ): Promise<AudioTransport> {
    if (!uploadChunked.shouldUseChunked(file)) return { uploadId: null };
    const key = AudioUpload.fileKey(file);
    const cached = this.completedByFile.get(key);
    if (cached) {
      const status = await uploadSessions
        .fetchStatus(cached)
        .catch(() => null);
      if (
        status &&
        status.totalSize === file.size &&
        status.received >= status.totalSize
      ) {
        return { uploadId: cached };
      }
      this.completedByFile.delete(key);
    }
    let pending = this.pendingByFile.get(key);
    if (!pending) {
      pending = uploadChunked
        .uploadFile(file, { signal: opts.signal })
        .then((result) => {
          this.completedByFile.set(key, result.uploadId);
          return result.uploadId;
        })
        .finally(() => {
          this.pendingByFile.delete(key);
        });
      this.pendingByFile.set(key, pending);
    }
    return { uploadId: await pending };
  }

  /** Drop cached + in-flight state for a file (stale bytes, evict-retry). */
  forget(file: File): void {
    const key = AudioUpload.fileKey(file);
    this.completedByFile.delete(key);
    this.pendingByFile.delete(key);
  }

  /**
   * One-shot JSON POST (audio analysis): header-only when a session exists,
   * direct FormData otherwise. Evicts a dead cached id and retries once when
   * the server reports FILE_REQUIRED (row outlived its tmp bytes).
   */
  async postJson<T>(
    endpoint: string,
    file: File,
    opts: AudioUploadOptions = {},
  ): Promise<T> {
    const transport = await this.ensureTransport(file, opts);
    try {
      return await this.postJsonWith<T>(endpoint, file, transport, opts);
    } catch (e) {
      if (transport.uploadId && AudioUpload.isFileRequiredError(e)) {
        this.forget(file);
        const retry = await this.ensureTransport(file, opts);
        return this.postJsonWith<T>(endpoint, file, retry, opts);
      }
      throw e;
    }
  }

  /**
   * One-shot Blob POST (audio extract / preview pull): header-only when a
   * session exists, direct FormData otherwise. Same evict-retry as postJson.
   */
  async postBlob(
    endpoint: string,
    file: File,
    opts: AudioUploadOptions = {},
  ): Promise<Blob> {
    const transport = await this.ensureTransport(file, opts);
    try {
      return await this.postBlobWith(endpoint, file, transport, opts);
    } catch (e) {
      if (transport.uploadId && AudioUpload.isFileRequiredError(e)) {
        this.forget(file);
        const retry = await this.ensureTransport(file, opts);
        return this.postBlobWith(endpoint, file, retry, opts);
      }
      throw e;
    }
  }

  /**
   * JSON POST over a pre-resolved transport — fan-outs (per-track previews)
   * ensure once, then share the transport across pulls.
   */
  async postJsonWith<T>(
    endpoint: string,
    file: File,
    transport: AudioTransport,
    opts: AudioUploadOptions = {},
  ): Promise<T> {
    if (transport.uploadId) {
      return apiClient.postWithUploadId<T>(
        endpoint,
        transport.uploadId,
        null,
        AudioUpload.signalInit(opts),
      );
    }
    const form = new FormData();
    form.append("file", file);
    return apiClient.formPost<T>(
      endpoint,
      form,
      AudioUpload.signalInit(opts),
    );
  }

  /**
   * Blob POST over a pre-resolved transport — fan-outs (per-track previews)
   * ensure once, then share the transport across pulls.
   */
  async postBlobWith(
    endpoint: string,
    file: File,
    transport: AudioTransport,
    opts: AudioUploadOptions = {},
  ): Promise<Blob> {
    if (transport.uploadId) {
      return apiClient.postBlobWithUploadId(
        endpoint,
        transport.uploadId,
        AudioUpload.signalInit(opts),
      );
    }
    const form = new FormData();
    form.append("file", file);
    return apiClient.postBlob(endpoint, form, AudioUpload.signalInit(opts));
  }

  /** File identity key — a different file never reuses another's bytes. */
  private static fileKey(file: File): string {
    return `${file.name}|${file.size}|${file.lastModified}`;
  }

  /** `{signal}` init or undefined (fetch treats explicit undefined fine). */
  private static signalInit(opts: AudioUploadOptions): RequestInit | undefined {
    return opts.signal ? { signal: opts.signal } : undefined;
  }

  /**
   * True when the server answered FILE_REQUIRED — `requestJson`/`postBlob`
   * keep only the envelope message, so match its text (coupled to
   * `resolveInput` in `apps/api/src/routes/audio.ts`: "Audio file is
   * required"). Degrades to no-retry if the text ever changes.
   */
  private static isFileRequiredError(e: unknown): boolean {
    return (
      e instanceof Error && e.message.includes("Audio file is required")
    );
  }
}

/** App-wide singleton — audio analysis/preview/extract go through this. */
export const audioUpload = new AudioUpload();
