// Chunked, resumable upload for large files (up to 10GB).
// Uses server's /api/upload/{init,chunk,complete} with random-access writes
// so Bun never buffers the whole file in RAM. Progress is reportable per chunk.

import { API_BASE_URL } from "./api-client";

export interface ChunkedUploadOptions {
  chunkSize?: number; // default 8MB — tuned for LAN/localhost throughput vs memory
  maxRetries?: number;
  onProgress?: (sent: number, total: number) => void;
  signal?: AbortSignal;
}

export interface ChunkedUploadResult {
  uploadId: string;
  filename: string;
  totalSize: number;
  temporaryPath: string;
}

const DEFAULT_CHUNK = 8 * 1024 * 1024;
const MAX_RETRIES = 3;

export async function uploadFileChunked(
  file: File,
  opts: ChunkedUploadOptions = {},
): Promise<ChunkedUploadResult> {
  const chunkSize = Math.min(Math.max(1 * 1024 * 1024, opts.chunkSize ?? DEFAULT_CHUNK), 64 * 1024 * 1024);
  const maxRetries = opts.maxRetries ?? MAX_RETRIES;

  // 1) init
  const initRes = await fetch(`${API_BASE_URL}/api/upload/init`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename: file.name, totalSize: file.size, chunkSize }),
    signal: opts.signal,
  });
  if (!initRes.ok) {
    const err = await initRes.json().catch(() => null) as { error?: string } | null;
    throw new Error(err?.error ?? `Upload init failed: ${initRes.status}`);
  }
  const init = (await initRes.json()) as { uploadId: string; chunkSize: number; totalSize: number; temporaryPath: string };
  const { uploadId } = init;
  const effectiveChunk = init.chunkSize ?? chunkSize;
  const totalChunks = Math.ceil(file.size / effectiveChunk);

  // 2) send chunks sequentially (keeps memory flat; enables resume on failure)
  let sent = 0;
  for (let i = 0; i < totalChunks; i++) {
    if (opts.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const offset = i * effectiveChunk;
    const end = Math.min(offset + effectiveChunk, file.size);
    const blob = file.slice(offset, end);

    let attempt = 0;
    while (true) {
      try {
        const buf = await blob.arrayBuffer();
        const res = await fetch(
          `${API_BASE_URL}/api/upload/chunk/${uploadId}?index=${i}&offset=${offset}`,
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
          const e = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(e?.error ?? `Chunk ${i} failed: ${res.status}`);
        }
        sent += buf.byteLength;
        opts.onProgress?.(sent, file.size);
        break;
      } catch (e) {
        if ((e as DOMException)?.name === "AbortError") throw e;
        attempt++;
        if (attempt > maxRetries) throw e;
        await new Promise((r) => setTimeout(r, 400 * attempt));
      }
    }
  }

  // 3) complete
  const completeRes = await fetch(`${API_BASE_URL}/api/upload/complete/${uploadId}`, {
    method: "POST",
    signal: opts.signal,
  });
  if (!completeRes.ok) {
    const e = (await completeRes.json().catch(() => null)) as { error?: string } | null;
    throw new Error(e?.error ?? `Upload complete failed: ${completeRes.status}`);
  }
  const complete = (await completeRes.json()) as ChunkedUploadResult;
  return complete;
}

// XHR-based FormData upload with real upload.onprogress (for files < ~1GB where simple FormData is fine).
// TanStack Query can't observe fetch upload progress — XHR can.
export function uploadFormWithProgress<T>(
  endpoint: string,
  form: FormData,
  opts: { onUploadProgress?: (loaded: number, total: number) => void; signal?: AbortSignal } = {},
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const url = `${API_BASE_URL}${endpoint}`;

    if (opts.signal) {
      if (opts.signal.aborted) return reject(new DOMException("Aborted", "AbortError"));
      opts.signal.addEventListener("abort", () => xhr.abort(), { once: true });
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
        const err = (xhr.response as { error?: string } | null)?.error ?? `API error: ${xhr.status}`;
        reject(new Error(err));
      }
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.onabort = () => reject(new DOMException("Aborted", "AbortError"));
    xhr.send(form);
  });
}

// Threshold heuristic: use chunked above this size to avoid buffering whole file in Bun.
export const CHUNKED_THRESHOLD_BYTES = 256 * 1024 * 1024; // 256 MB

export function shouldUseChunked(file: File): boolean {
  return file.size > CHUNKED_THRESHOLD_BYTES;
}
