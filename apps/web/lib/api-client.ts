// Central HTTP service for the local Hono API (`NEXT_PUBLIC_API_URL`).
//
// Editors never `fetch()` the backend directly — they go through the
// `apiClient` singleton below (`apiClient.get/post/formPost/...`), which owns
// base-URL resolution, JSON envelope error shaping (via `transcodeJobs`),
// and the `x-upload-id` chunked-upload POST variant. `exportQueue`,
// `upload-chunked`, `transcode-jobs`, and the admin/m Metadata hooks are all
// thin callers over this service.
import { transcodeJobs } from "./transcode-jobs";
import type {
  FFprobeReport,
  TranscodeProgress,
  TranscodeResponse,
} from "@repo/types";

export type { FFprobeReport, TranscodeProgress, TranscodeResponse };

/** ffprobe-backed metadata returned by `POST /api/metadata`. */
export interface VideoMetadata {
  filename: string;
  containerFormat: string;
  durationSeconds: number;
  width: number;
  height: number;
  frameRate: number;
  videoCodec: string;
  audioCodec?: string;
  bitrateKbps: number;
  ffprobe: FFprobeReport;
}

/** Waveform/loudness report returned by `POST /api/audio/analysis`. */
export interface AudioAnalysis {
  duration: number;
  sampleRate: number;
  peaks: number[];
  rms: number[];
  tracks: Array<{
    trackIndex: number;
    streamIndex: number;
    codec: string | null;
    codecLongName: string | null;
    language: string | null;
    title: string | null;
    channels: number;
    sampleRate: number;
  }>;
  selectedTrack: number;
  loudness: {
    inputIntegratedLufs: number;
    inputTruePeak: number;
    inputLra: number;
    targetIntegratedLufs: number;
  } | null;
}

/**
 * Singleton service owning every raw HTTP call to the backend: base-URL
 * resolution plus JSON/form/patch/delete/blob helpers with shared envelope
 * error shaping. All mutable config lives here (never scattered across
 * callers), so endpoint construction stays consistent for fetch, XHR, SSE,
 * and `preconnect` hints.
 */
class APIClient {
  /** Resolved once at startup from `NEXT_PUBLIC_API_URL` (local default). */
  private readonly _baseUrl: string;

  constructor() {
    this._baseUrl = APIClient.readBaseUrl();
  }

  // ------------------------------------------------------------------ public

  /** API origin, e.g. `http://localhost:3100` (no trailing slash). */
  get baseUrl(): string {
    return this._baseUrl;
  }

  /**
   * Resolve an endpoint to an absolute URL. Absolute URLs pass through
   * untouched; relative progress URLs (e.g. SSE `progressUrl`) resolve
   * against the API origin so `EventSource` never hits the Next.js server.
   */
  url(endpoint: string): string {
    if (/^https?:\/\//i.test(endpoint)) return endpoint;
    return `${this._baseUrl}${endpoint}`;
  }

  /**
   * GET JSON and parse it as `T`. Non-2xx responses throw with the server
   * envelope message when present, else `API error: <status>`.
   */
  async get<T>(endpoint: string, init?: RequestInit): Promise<T> {
    return this.requestJson<T>(this.url(endpoint), init);
  }

  /**
   * POST a JSON body and parse the JSON reply as `T`. Used for metadata
   * probes and other small JSON endpoints (multipart uploads use
   * `formPost` / `uploadChunked.uploadForm` instead for progress events).
   */
  async post<T>(
    endpoint: string,
    body: unknown,
    init?: RequestInit,
  ): Promise<T> {
    return this.requestJson<T>(this.url(endpoint), {
      ...init,
      method: "POST",
      headers: { "Content-Type": "application/json", ...init?.headers },
      body: JSON.stringify(body),
    });
  }

  /**
   * POST a `FormData` body (file + settings) and parse the JSON reply.
   * Error payloads are shaped through the shared envelope reader so 422
   * `issues[]` reach toasts instead of a bare status code.
   */
  async formPost<T>(
    endpoint: string,
    form: FormData,
    init?: RequestInit,
  ): Promise<T> {
    return this.requestJson<T>(this.url(endpoint), {
      ...init,
      method: "POST",
      body: form,
    });
  }

  /**
   * POST a multipart form that reuses a chunked-upload sparse temp file via
   * the `x-upload-id` header (files >256 MB upload once, then every job POST
   * references the same upload). `form` may be empty when the endpoint needs
   * no extra parts (e.g. `POST /api/metadata` after a chunked upload).
   */
  async postWithUploadId<T>(
    endpoint: string,
    uploadId: string,
    form?: FormData | null,
    init?: RequestInit,
  ): Promise<T> {
    return this.requestJson<T>(this.url(endpoint), {
      ...init,
      method: "POST",
      headers: { "x-upload-id": uploadId, ...init?.headers },
      body: form ?? undefined,
    });
  }

  /** PATCH a JSON body (e.g. job rename) and parse the JSON reply. */
  async patch<T>(
    endpoint: string,
    body: unknown,
    init?: RequestInit,
  ): Promise<T> {
    return this.requestJson<T>(this.url(endpoint), {
      ...init,
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...init?.headers },
      body: JSON.stringify(body),
    });
  }

  /**
   * DELETE and parse the JSON reply (job delete / clear-all / cooperative
   * cancel). Callers needing the raw `Response` (status text slicing) should
   * use `url()` + `fetch` directly.
   */
  async delete<T>(endpoint: string, init?: RequestInit): Promise<T> {
    return this.requestJson<T>(this.url(endpoint), {
      ...init,
      method: "DELETE",
    });
  }

  /**
   * POST a `FormData` body and return the raw output `Blob` (audio-extract
   * pulls). Failures throw with the envelope message, mirroring `formPost`.
   */
  async postBlob(
    endpoint: string,
    form: FormData,
    init?: RequestInit,
  ): Promise<Blob> {
    const res = await fetch(this.url(endpoint), {
      ...init,
      method: "POST",
      body: form,
    });
    if (!res.ok) {
      const payload = (await res.json().catch(() => null)) as unknown;
      throw new Error(
        transcodeJobs.serverErrorMessage(payload) ?? `API error: ${res.status}`,
      );
    }
    return res.blob();
  }

  // ----------------------------------------------------------------- private

  /**
   * Single fetch→JSON funnel: performs the request, shapes non-2xx failures
   * through the shared envelope reader, and parses the success body as `T`.
   */
  private async requestJson<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, init);
    if (!res.ok) {
      const payload = (await res.json().catch(() => null)) as unknown;
      throw new Error(
        transcodeJobs.serverErrorMessage(payload) ?? `API error: ${res.status}`,
      );
    }
    return res.json() as Promise<T>;
  }

  /** Read the API origin once (trailing slashes trimmed, local fallback). */
  private static readBaseUrl(): string {
    const raw = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3100";
    return raw.replace(/\/+$/, "");
  }
}

/** App-wide singleton — callers use this instead of raw `fetch`. */
export const apiClient = new APIClient();
