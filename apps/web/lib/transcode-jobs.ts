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
//
// Callers go through the `transcodeJobs` singleton below instead of importing
// free functions: envelope shaping (`serverErrorMessage`), Retry-After
// parsing, shaped POST/XHR errors, cooperative cancel, and the small
// queue/log-tail label helpers all live here.

import { apiClient } from "./api-client";

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

/** Minimal header source accepted by `throwTranscodeHttpError`. */
export type HeaderGetter = { get(name: string): string | null };

/**
 * Singleton service owning every transcode-job concern outside the job
 * queue itself: API error-envelope shaping, Retry-After parsing, shaped
 * HTTP/XHR errors (so 429 queue-full stays distinct from validation
 * failures), cooperative cancel, and the queue-position / log-tail label
 * helpers. Stateless — all mutable job state lives in `ExportQueue` and
 * the stores, never here.
 */
export class TranscodeJobs {
  /** Fallback 429 retry hint (seconds) when Retry-After is absent. */
  private static readonly FALLBACK_RETRY_SECONDS = 10;
  /** Cap for the ffmpeg tail appended to failure messages. */
  private static readonly MAX_LOG_TAIL_CHARS = 2000;
  /** Cap for per-field 400 reasons appended under the headline. */
  private static readonly MAX_ISSUE_LINES = 8;

  // ------------------------------------------------------------------ public

  /** Parse a Retry-After header (delta-seconds or HTTP-date) into ms. */
  public parseRetryAfterMs(value: string | null): number | null {
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
  public serverErrorMessage(payload: unknown): string | undefined {
    if (!payload || typeof payload !== "object") return undefined;
    const p = payload as {
      error?: unknown;
      message?: unknown;
      issues?: unknown;
    };
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
      .slice(0, TranscodeJobs.MAX_ISSUE_LINES);
    return details.length > 0 ? `${headline}\n${details.join("\n")}` : headline;
  }

  /** User-facing message for a failed transcode POST. 429 explains the queue. */
  public transcodeHttpMessage(
    status: number,
    serverError?: string,
    retryAfterMs: number | null = null,
  ): string {
    if (status === 429) {
      const secs =
        retryAfterMs != null
          ? Math.max(1, Math.round(retryAfterMs / 1000))
          : TranscodeJobs.FALLBACK_RETRY_SECONDS;
      return (
        serverError ??
        `Transcode queue is full — retry in ~${secs}s. Your upload is safe; just re-export.`
      );
    }
    return serverError ?? `Export failed: ${status}`;
  }

  /** Throw a shaped TranscodeHttpError for a non-OK transcode POST response. */
  public throwTranscodeHttpError(
    res: { status: number; headers: HeaderGetter },
    payload: unknown,
  ): never {
    const retryAfterMs = this.parseRetryAfterMs(res.headers.get("Retry-After"));
    throw new TranscodeHttpError(
      res.status,
      this.transcodeHttpMessage(
        res.status,
        this.serverErrorMessage(payload),
        retryAfterMs,
      ),
      retryAfterMs,
    );
  }

  /** Attach HTTP status info to an XHR rejection (uploadChunked.uploadForm path). */
  public shapeXhrError(
    status: number,
    serverError: string | undefined,
    retryAfterHeader: string | null,
  ): TranscodeHttpError {
    const retryAfterMs = this.parseRetryAfterMs(retryAfterHeader);
    return new TranscodeHttpError(
      status,
      this.transcodeHttpMessage(status, serverError, retryAfterMs),
      retryAfterMs,
    );
  }

  /** Cooperative cancel: SIGTERM→SIGKILL ffmpeg, row + logTail kept server-side. */
  public async cancelTranscodeJob(jobId: string): Promise<string> {
    const res = await fetch(
      apiClient.url(
        `/api/transcode/jobs/${encodeURIComponent(jobId)}?mode=cancel`,
      ),
      { method: "DELETE" },
    );
    if (!res.ok) {
      const payload = (await res.json().catch(() => null)) as unknown;
      throw new Error(
        this.serverErrorMessage(payload) ?? `Cancel failed: ${res.status}`,
      );
    }
    const body = (await res.json()) as { status?: string };
    return body.status ?? "cancelled";
  }

  /** "Queued #3" / "Queued" label for queuePosition-aware toasts. */
  public queuedLabel(queuePosition?: number | null): string {
    return typeof queuePosition === "number" && queuePosition >= 0
      ? `Queued #${queuePosition + 1}`
      : "Queued";
  }

  /** Append the ffmpeg tail log to a failure message (truncated, single block). */
  public withLogTail(
    message: string | undefined,
    logTail?: string | null,
    maxChars = TranscodeJobs.MAX_LOG_TAIL_CHARS,
  ): string {
    const base = message ?? "Export failed.";
    const tail = (logTail ?? "").trim();
    if (!tail) return base;
    const clipped = tail.length > maxChars ? `…${tail.slice(-maxChars)}` : tail;
    return `${base}\n\nffmpeg log:\n${clipped}`;
  }
}

/** App-wide singleton — callers use this instead of free functions. */
export const transcodeJobs = new TranscodeJobs();
