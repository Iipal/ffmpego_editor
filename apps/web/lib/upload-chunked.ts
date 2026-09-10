// Chunked, resumable upload service (up to 10GB).
//
// Editors go through the `uploadChunked` singleton below instead of raw
// fetch/XHR: `uploadFile` drives the server's
// /api/upload/{init,chunk,complete} with random-access writes so Bun never
// buffers the whole file in RAM (progress reportable per chunk), while
// `uploadForm` is the XHR-based FormData path with real `upload.onprogress`
// (for files < ~1GB where simple FormData is fine — TanStack Query can't
// observe fetch upload progress, XHR can). `shouldUseChunked` is the
// threshold heuristic choosing between the two.

import { apiClient } from "./api-client";
import { transcodeJobs } from "./transcode-jobs";
import { uploadSessions } from "./upload-sessions";

/** Tuning knobs for `UploadChunked.uploadFile` (all optional). */
export interface ChunkedUploadOptions {
  chunkSize?: number; // default 8MB — tuned for LAN/localhost throughput vs memory
  maxRetries?: number;
  onProgress?: (sent: number, total: number) => void;
  signal?: AbortSignal;
}

/** Server handshake result for a completed chunked upload. */
export interface ChunkedUploadResult {
  uploadId: string;
  assetId: string;
  filename: string;
  totalSize: number;
  /** True when an interrupted session was resumed (some chunks skipped). */
  resumed: boolean;
  /** Bytes already on the server before this call sent anything. */
  resumedBytes: number;
}

/** Progress/signal knobs for `UploadChunked.uploadForm`. */
export interface UploadFormOptions {
  onUploadProgress?: (loaded: number, total: number) => void;
  signal?: AbortSignal;
}

/**
 * Singleton service owning every upload transport: the chunked
 * init→chunks→complete pipeline, the XHR progress upload, and the size
 * heuristic between them. Stateless — all mutable progress flows out through
 * the per-call `onProgress` callbacks, never stored here.
 */
export class UploadChunked {
  /** Default chunk size — tuned for LAN/localhost throughput vs memory. */
  private static readonly DEFAULT_CHUNK_SIZE = 8 * 1024 * 1024;
  /** Chunk sizes below this are clamped up (too many round-trips). */
  private static readonly MIN_CHUNK_SIZE = 1 * 1024 * 1024;
  /** Chunk sizes above this are clamped down (memory pressure). */
  private static readonly MAX_CHUNK_SIZE = 64 * 1024 * 1024;
  /** Per-chunk send attempts before the upload fails. */
  private static readonly MAX_RETRIES = 3;
  /** Linear backoff base between chunk retries (`400ms * attempt`). */
  private static readonly RETRY_BASE_DELAY_MS = 400;
  /** Files above this use the chunked path (avoids buffering in Bun). */
  private static readonly THRESHOLD_BYTES = 256 * 1024 * 1024; // 256 MB

  // ------------------------------------------------------------------ public

  /**
   * Upload a file via the chunked pipeline: POST /api/upload/init, send
   * chunks sequentially (flat memory, resumable on failure with per-chunk
   * retries), then POST /api/upload/complete. Reports `(sent, total)` per
   * chunk; aborts promptly on `opts.signal`.
   *
   * Transparent resume: when this exact file (name + size + lastModified)
   * has a remembered session with bytes still on the server, the uploader
   * verifies it via `GET /upload/status` and skips already-received chunk
   * indices instead of re-sending them. The server counts only fully-written
   * chunks and writes each chunk at its explicit offset, so re-sending a
   * partially-written chunk self-heals. Falls back to a fresh session when
   * the remembered one is gone (swept/aborted) or mismatched.
   */
  public async uploadFile(
    file: File,
    opts: ChunkedUploadOptions = {},
  ): Promise<ChunkedUploadResult> {
    const chunkSize = Math.min(
      Math.max(
        UploadChunked.MIN_CHUNK_SIZE,
        opts.chunkSize ?? UploadChunked.DEFAULT_CHUNK_SIZE,
      ),
      UploadChunked.MAX_CHUNK_SIZE,
    );
    const maxRetries = opts.maxRetries ?? UploadChunked.MAX_RETRIES;

    // 0) resume check — same file uploaded before?
    let uploadId: string | null = null;
    let effectiveChunk = chunkSize;
    let sent = 0;
    let resumed = false;
    let resumedBytes = 0;
    let skip = new Set<number>();
    const remembered = uploadSessions.lookup(file);
    if (remembered) {
      let status = null;
      try {
        status = await uploadSessions.fetchStatus(remembered.uploadId);
      } catch (e) {
        console.warn("[upload-chunked] resume status check failed:", e);
      }
      if (status && status.totalSize === file.size && status.received > 0) {
        // Authoritative skip-set from the server; offsets follow the chunk
        // size that created the session so indices stay aligned.
        uploadId = status.uploadId;
        effectiveChunk = remembered.chunkSize;
        skip = new Set(status.chunks);
        sent = Math.min(status.received, file.size);
        resumedBytes = sent;
        resumed = true;
        opts.onProgress?.(sent, file.size);
      } else {
        // Gone or mismatched — forget so the next attempt inits fresh.
        uploadSessions.forget(remembered.uploadId);
      }
    }

    // 1) init (fresh uploads only)
    if (uploadId === null) {
      const initRes = await fetch(apiClient.url("/api/upload/init"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          totalSize: file.size,
          chunkSize,
        }),
        signal: opts.signal,
      });
      if (!initRes.ok) {
        const err = (await initRes.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(err?.error ?? `Upload init failed: ${initRes.status}`);
      }
      const init = (await initRes.json()) as {
        uploadId: string;
        assetId: string;
        chunkSize: number;
        totalSize: number;
      };
      uploadId = init.uploadId;
      effectiveChunk = init.chunkSize ?? chunkSize;
      uploadSessions.remember(file, uploadId, effectiveChunk);
    }
    const totalChunks = Math.ceil(file.size / effectiveChunk);

    // 2) send chunks sequentially (keeps memory flat; enables resume on failure)
    for (let i = 0; i < totalChunks; i++) {
      if (opts.signal?.aborted) throw new DOMException("Aborted", "AbortError");
      // Already on the server from the interrupted session — skip the bytes
      // (the server also dedupes re-sent indices idempotently).
      if (skip.has(i)) continue;
      const offset = i * effectiveChunk;
      const end = Math.min(offset + effectiveChunk, file.size);
      const blob = file.slice(offset, end);

      let attempt = 0;
      while (true) {
        try {
          const buf = await blob.arrayBuffer();
          const res = await fetch(
            apiClient.url(
              `/api/upload/chunk/${uploadId}?index=${i}&offset=${offset}`,
            ),
            {
              method: "POST",
              headers: {
                "Content-Type": "application/octet-stream",
                "x-chunk-index": String(i),
                "x-chunk-offset": String(offset),
              },
              body: buf,
              signal: opts.signal,
            },
          );
          if (!res.ok) {
            const e = (await res.json().catch(() => null)) as unknown;
            throw new Error(
              transcodeJobs.serverErrorMessage(e) ??
                `Chunk ${i} failed: ${res.status}`,
            );
          }
          sent += buf.byteLength;
          opts.onProgress?.(sent, file.size);
          break;
        } catch (e) {
          if ((e as DOMException)?.name === "AbortError") throw e;
          attempt++;
          if (attempt > maxRetries) throw e;
          await new Promise((r) =>
            setTimeout(r, UploadChunked.RETRY_BASE_DELAY_MS * attempt),
          );
        }
      }
    }

    // 3) complete
    const completeRes = await fetch(
      apiClient.url(`/api/upload/complete/${uploadId}`),
      {
        method: "POST",
        signal: opts.signal,
      },
    );
    if (!completeRes.ok) {
      const e = (await completeRes.json().catch(() => null)) as unknown;
      throw new Error(
        transcodeJobs.serverErrorMessage(e) ??
          `Upload complete failed: ${completeRes.status}`,
      );
    }
    const complete = (await completeRes.json()) as ChunkedUploadResult;
    // Session consumed — drop the resume memory so a later upload of the
    // same file starts fresh instead of pointlessly re-verifying.
    uploadSessions.forget(uploadId);
    return { ...complete, resumed, resumedBytes };
  }

  /**
   * POST a `FormData` body via XHR with real `upload.onprogress` events and
   * parse the JSON reply as `T`. Non-2xx rejections carry HTTP status +
   * Retry-After (shaped for 429 queue-full handling); the shared envelope
   * reader folds zod `issues` into the message when present.
   */
  public uploadForm<T>(
    endpoint: string,
    form: FormData,
    opts: UploadFormOptions & { signal?: AbortSignal } = {},
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const url = apiClient.url(endpoint);

      if (opts.signal) {
        if (opts.signal.aborted)
          return reject(new DOMException("Aborted", "AbortError"));
        opts.signal.addEventListener("abort", () => xhr.abort(), {
          once: true,
        });
      }

      xhr.open("POST", url, true);
      xhr.responseType = "json";

      if (opts.onUploadProgress && xhr.upload) {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) opts.onUploadProgress!(e.loaded, e.total);
        };
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(xhr.response as T);
        } else {
          // B2: carry HTTP status + Retry-After so callers can shape 429
          // (queue full) distinctly from validation errors.
          // B4: serverErrorMessage includes zod `issues` when present.
          const serverError = transcodeJobs.serverErrorMessage(xhr.response);
          reject(
            transcodeJobs.shapeXhrError(
              xhr.status,
              serverError,
              xhr.getResponseHeader("Retry-After"),
            ),
          );
        }
      };
      xhr.onerror = () => reject(new Error("Network error during upload"));
      xhr.onabort = () => reject(new DOMException("Aborted", "AbortError"));
      xhr.send(form);
    });
  }

  /**
   * Threshold heuristic: files above this size should use `uploadFile` so
   * Bun never buffers the whole file in RAM.
   */
  public shouldUseChunked(file: File): boolean {
    return file.size > UploadChunked.THRESHOLD_BYTES;
  }
}

/** App-wide singleton — editors upload through this service. */
export const uploadChunked = new UploadChunked();
