// Shared B1/B2 frontend wiring for the transcode job API.
//
// B1 (SQLite persistence, keep-until-delete):
// - Jobs survive API restarts, so the UI must handle pre-existing statuses
//   (`queued`, `cancelled`) and must NOT assume a download deletes the job.
// - Outputs persist server-side: re-download any `completed` job from Admin.
//
// B2 (bounded queue + cooperative cancel):
// - POST /api/transcode* may return 429 + Retry-After when the queue is full.
// - SSE emits `queued` (with queuePosition) before `processing`, and
// - `cancelled` when a job is cooperatively cancelled.
// - DELETE /api/transcode/jobs/:id?mode=cancel kills ffmpeg but keeps the row.

import { API_BASE_URL } from "./api-client";

/** Error carrying the HTTP status (+ Retry-After) of a failed transcode POST. */
export class TranscodeHttpError extends Error {
  status: number;
  retryAfterMs: number | null;
  constructor(
    status: number,
    message: string,
    retryAfterMs: number | null = null,
  ) {
    super(message);
    this.name = "TranscodeHttpError";
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

/** Rejection reason when the server reports a job as `cancelled`. */
export class TranscodeCancelledError extends Error {
  constructor(message = "Export cancelled.") {
    super(message);
    this.name = "TranscodeCancelledError";
  }
}

/** Parse a Retry-After header (delta-seconds or HTTP-date) into ms. */
export function parseRetryAfterMs(value: string | null): number | null {
  if (!value) return null;
  const secs = Number(value);
  if (Number.isFinite(secs) && secs >= 0) return secs * 1000;
  const dateMs = Date.parse(value);
  if (Number.isFinite(dateMs)) return Math.max(0, dateMs - Date.now());
  return null;
}

/**
 * Shared error envelope reader. The API returns `{ code, message, issues?,
 * requestId?, jobId?, details? }` (@repo/contracts); legacy `{ error }`
 * payloads are still accepted. 400s combine the headline with per-field
 * reasons so toasts show actionable detail instead of just the headline.
 */
export function serverErrorMessage(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const p = payload as { error?: unknown; message?: unknown; issues?: unknown };
  const headline =
    typeof p.message === "string" && p.message.length > 0
      ? p.message
      : typeof p.error === "string" && p.error.length > 0
        ? p.error
        : undefined;
  if (!headline) return undefined;
  if (!Array.isArray(p.issues) || p.issues.length === 0) return headline;
  const details = p.issues
    .filter((i): i is string => typeof i === "string" && i.length > 0)
    .slice(0, 8);
  return details.length > 0 ? `${headline}\n${details.join("\n")}` : headline;
}

function errorPayloadOf(payload: unknown): string | undefined {
  return serverErrorMessage(payload);
}

/** User-facing message for a failed transcode POST. 429 explains the queue. */
export function transcodeHttpMessage(
  status: number,
  serverError?: string,
  retryAfterMs: number | null = null,
): string {
  if (status === 429) {
    const secs =
      retryAfterMs != null ? Math.max(1, Math.round(retryAfterMs / 1000)) : 10;
    return (
      serverError ??
      `Transcode queue is full — retry in ~${secs}s. Your upload is safe; just re-export.`
    );
  }
  return serverError ?? `Export failed: ${status}`;
}

type HeaderGetter = { get(name: string): string | null };

/** Throw a shaped TranscodeHttpError for a non-OK transcode POST response. */
export function throwTranscodeHttpError(
  res: { status: number; headers: HeaderGetter },
  payload: unknown,
): never {
  throw new TranscodeHttpError(
    res.status,
    transcodeHttpMessage(
      res.status,
      errorPayloadOf(payload),
      parseRetryAfterMs(res.headers.get("Retry-After")),
    ),
    parseRetryAfterMs(res.headers.get("Retry-After")),
  );
}

/** Attach HTTP status info to an XHR rejection (uploadFormWithProgress path). */
export function shapeXhrError(
  status: number,
  serverError: string | undefined,
  retryAfterHeader: string | null,
): TranscodeHttpError {
  const retryAfterMs = parseRetryAfterMs(retryAfterHeader);
  return new TranscodeHttpError(
    status,
    transcodeHttpMessage(status, serverError, retryAfterMs),
    retryAfterMs,
  );
}

/** Cooperative cancel: SIGTERM→SIGKILL ffmpeg, row + logTail kept server-side. */
export async function cancelTranscodeJob(jobId: string): Promise<string> {
  const res = await fetch(
    `${API_BASE_URL}/api/transcode/jobs/${encodeURIComponent(jobId)}?mode=cancel`,
    { method: "DELETE" },
  );
  if (!res.ok) {
    const payload = (await res.json().catch(() => null)) as unknown;
    throw new Error(serverErrorMessage(payload) ?? `Cancel failed: ${res.status}`);
  }
  const body = (await res.json()) as { status?: string };
  return body.status ?? "cancelled";
}

/** "Queued #3" / "Queued" label for queuePosition-aware toasts. */
export function queuedLabel(queuePosition?: number | null): string {
  return typeof queuePosition === "number" && queuePosition >= 0
    ? `Queued #${queuePosition + 1}`
    : "Queued";
}

/** Append the ffmpeg tail log to a failure message (truncated, single block). */
export function withLogTail(
  message: string | undefined,
  logTail?: string | null,
  maxChars = 2000,
): string {
  const base = message ?? "Export failed.";
  const tail = (logTail ?? "").trim();
  if (!tail) return base;
  const clipped = tail.length > maxChars ? `…${tail.slice(-maxChars)}` : tail;
  return `${base}\n\nffmpeg log:\n${clipped}`;
}
