// Single API module for the local Hono API (`NEXT_PUBLIC_API_URL`): base-URL
// resolution plus every axios JSON/blob funnel with shared envelope error
// shaping. All TanStack Query `queryFn`/`mutationFn` code and every URL
// builder (SSE, XHR, downloads) go through here — import from the
// `@/lib/query-hooks` barrel. Deliberately NOT axios: chunked binary chunk
// PUTs + XHR `uploadForm` (upload progress needs XHR/fetch streaming), SSE
// `EventSource` streams (axios has no SSE), absolute-URL blob downloads in
// `save-blob-file` (plain fetch is enough), and external font fetches.
// TanStack Query itself stays — axios is only the fetcher inside
// `queryFn`/`mutationFn`, never a cache replacement.
import axios from "axios";
import { TranscodeHttpError, transcodeJobs } from "../transcode-jobs";

// js-hoist-regexp: module scope — apiUrl() runs on every API/SSE/download call.
const ABSOLUTE_URL_RE = /^https?:\/\//i;

/** API origin, e.g. `http://localhost:3100` (no trailing slash). */
export function apiBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3100";
  return raw.replace(/\/+$/, "");
}

/**
 * Resolve an endpoint to an absolute URL. Absolute URLs pass through
 * untouched; relative progress URLs (e.g. SSE `progressUrl`) resolve
 * against the API origin so `EventSource` never hits the Next.js server.
 */
export function apiUrl(endpoint: string): string {
  if (ABSOLUTE_URL_RE.test(endpoint)) return endpoint;
  return `${apiBaseUrl()}${endpoint}`;
}

/** Throw a shaped `TranscodeHttpError` for a non-2xx axios response. */
function throwApiError(
  status: number,
  headers: unknown,
  payload: unknown,
): void {
  transcodeJobs.throwTranscodeHttpError(
    { status, headers: headers as { get(name: string): string | null } },
    payload,
  );
}

/** Options for the polling-GET funnel (health, storage, sessions, jobs). */
export interface GetJsonOptions {
  timeoutMs: number;
  label: string;
  signal?: AbortSignal;
  notFoundNull?: boolean;
}

/**
 * Polling GET funnel: timeout + human error shaping. Non-2xx throws
 * "`<label>` responded with HTTP <status>."; timeouts/connection failures
 * throw "…is the backend running on …?". Query `signal` aborts propagate
 * untouched as cancellations.
 */
export async function getJson<T>(
  path: string,
  opts: GetJsonOptions,
): Promise<T> {
  const baseUrl = apiBaseUrl();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs);
  let userAborted = false;
  const onUserAbort = () => {
    userAborted = true;
    ctrl.abort();
  };
  opts.signal?.addEventListener("abort", onUserAbort, { once: true });
  if (opts.signal?.aborted) onUserAbort();
  try {
    const res = await axios.get<T>(path, {
      baseURL: baseUrl,
      signal: ctrl.signal,
      validateStatus: () => true,
    });
    if (res.status === 404 && opts.notFoundNull) return null as T;
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`${opts.label} responded with HTTP ${res.status}.`);
    }
    return res.data;
  } catch (e) {
    if (axios.isCancel(e)) {
      // TanStack Query unmount / explicit abort — stay a cancellation, never
      // an error (Query ignores cancelled queryFns instead of erroring).
      if (userAborted || opts.signal?.aborted) throw e;
      throw new Error(
        `${opts.label} timed out — is the backend running on ${baseUrl}?`,
      );
    }
    if (e instanceof Error && e.message.startsWith(`${opts.label} responded`))
      throw e;
    throw new Error(`API unreachable — is the backend running on ${baseUrl}?`);
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onUserAbort);
  }
}

/**
 * Generic fetch→JSON funnel: `RequestInit` shape in, parsed `T` out.
 * Non-2xx throws `TranscodeHttpError` (status + Retry-After preserved;
 * 429/507/422 shaped). No default timeout — callers that need one (sweep,
 * session abort) already pass their own abort `signal`.
 */
export async function requestJson<T>(
  endpoint: string,
  init: RequestInit = {},
): Promise<T> {
  const baseUrl = apiBaseUrl();
  try {
    const res = await axios.request<T>({
      baseURL: baseUrl,
      url: endpoint,
      method: init.method ?? "GET",
      headers: init.headers as Record<string, string> | undefined,
      data: init.body ?? undefined,
      signal: init.signal ?? undefined,
      validateStatus: () => true,
    });
    if (res.status < 200 || res.status >= 300) {
      throwApiError(res.status, res.headers, res.data);
    }
    return res.data;
  } catch (e) {
    if (axios.isCancel(e)) throw e;
    if (e instanceof TranscodeHttpError) throw e;
    throw new Error(`API unreachable — is the backend running on ${baseUrl}?`);
  }
}

/**
 * Generic fetch→Blob funnel: POST a body, get the raw output `Blob`.
 * Same `TranscodeHttpError` shaping as `requestJson`.
 */
export async function requestBlob(
  endpoint: string,
  init: RequestInit = {},
): Promise<Blob> {
  const baseUrl = apiBaseUrl();
  try {
    const res = await axios.request<Blob>({
      baseURL: baseUrl,
      url: endpoint,
      method: init.method ?? "POST",
      headers: init.headers as Record<string, string> | undefined,
      data: init.body ?? undefined,
      signal: init.signal ?? undefined,
      responseType: "blob",
      validateStatus: () => true,
    });
    if (res.status < 200 || res.status >= 300) {
      // Blob error bodies arrive as JSON text — decode before shaping.
      const payload =
        res.data instanceof Blob
          ? await res.data.text().then(
              (t) => JSON.parse(t) as unknown,
              () => null,
            )
          : res.data;
      throwApiError(res.status, res.headers, payload);
    }
    return res.data;
  } catch (e) {
    if (axios.isCancel(e)) throw e;
    if (e instanceof TranscodeHttpError) throw e;
    throw new Error(`API unreachable — is the backend running on ${baseUrl}?`);
  }
}

/**
 * Label-shaped DELETE (admin job deletes): envelope message when the API
 * sent one, else "`<label>`: `<status>`" (e.g. "Delete failed: 500").
 */
export async function deleteJson<T>(
  path: string,
  opts: { label: string; signal?: AbortSignal },
): Promise<T> {
  try {
    const res = await axios.delete<T>(path, {
      baseURL: apiBaseUrl(),
      signal: opts.signal,
      validateStatus: () => true,
    });
    if (res.status < 200 || res.status >= 300) {
      throw new Error(
        transcodeJobs.serverErrorMessage(res.data) ??
          `${opts.label}: ${res.status}`,
      );
    }
    return res.data;
  } catch (e) {
    if (axios.isCancel(e)) throw e;
    throw e;
  }
}
