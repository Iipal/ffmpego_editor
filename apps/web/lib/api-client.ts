// Central HTTP service for the local Hono API (`NEXT_PUBLIC_API_URL`).
//
// Editors never `fetch()` the backend directly — they go through the
// `apiClient` singleton below (`apiClient.requestJson/requestBlob/url`),
// which owns base-URL resolution plus JSON/blob funnels with envelope
// error shaping (via `transcodeJobs`). `exportQueue`, `upload-chunked`,
// `transcode-jobs`, and the admin/metadata hooks are all thin callers
// over this service.
import { transcodeJobs } from "./transcode-jobs";
import type {
  FFprobeReport,
  TranscodeProgress,
  TranscodeResponse,
} from "@repo/types";

export type { FFprobeReport, TranscodeProgress, TranscodeResponse };

// js-hoist-regexp: module scope — url() runs on every API/SSE/download call.
const ABSOLUTE_URL_RE = /^https?:\/\//i;

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
 * resolution plus one JSON and one blob funnel with shared envelope error
 * shaping. All mutable config lives here (never scattered across
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
    if (ABSOLUTE_URL_RE.test(endpoint)) return endpoint;
    return `${this._baseUrl}${endpoint}`;
  }

  /**
   * POST a JSON body and parse the JSON reply as `T`. Used for metadata
   * probes and other small JSON endpoints (multipart uploads use
   * `uploadChunked.uploadForm` instead for progress events).
   */
  async post<T>(
    endpoint: string,
    body: unknown,
    init?: RequestInit,
  ): Promise<T> {
    return this.requestJson<T>(endpoint, {
      ...init,
      method: "POST",
      headers: { "Content-Type": "application/json", ...init?.headers },
      body: JSON.stringify(body),
    });
  }

  /**
   * Core fetch→JSON funnel: perform the request, shape non-2xx failures
   * through the shared envelope reader, and parse the success body as `T`.
   * Callers pass `method`/`headers`/`body` explicitly (JSON PATCH/DELETE,
   * multipart forms, `x-upload-id` reuse) instead of per-verb wrappers.
   * Failures throw `TranscodeHttpError` (status + Retry-After preserved)
   * so every caller — not just the transcode path — gets 429/507 shaping.
   */
  async requestJson<T>(endpoint: string, init?: RequestInit): Promise<T> {
    const res = await fetch(this.url(endpoint), init);
    if (!res.ok) {
      const payload = (await res.json().catch(() => null)) as unknown;
      transcodeJobs.throwTranscodeHttpError(res, payload);
    }
    return res.json() as Promise<T>;
  }

  /**
   * Core fetch→Blob funnel: POST a body and return the raw output `Blob`
   * (audio-extract pulls). A null/omitted body sends a bodiless POST (used
   * with `x-upload-id` reuse). Failures throw `TranscodeHttpError` like
   * `requestJson` above.
   */
  async requestBlob(endpoint: string, init?: RequestInit): Promise<Blob> {
    const res = await fetch(this.url(endpoint), {
      ...init,
      method: "POST",
    });
    if (!res.ok) {
      const payload = (await res.json().catch(() => null)) as unknown;
      transcodeJobs.throwTranscodeHttpError(res, payload);
    }
    return res.blob();
  }

  // ----------------------------------------------------------------- private

  /** Read the API origin once (trailing slashes trimmed, local fallback). */
  private static readBaseUrl(): string {
    const raw = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3100";
    return raw.replace(/\/+$/, "");
  }
}

/** App-wide singleton — callers use this instead of raw `fetch`. */
export const apiClient = new APIClient();
