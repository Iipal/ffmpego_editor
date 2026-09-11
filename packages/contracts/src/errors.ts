/**
 * Shared API contracts: error envelope, error codes, FFmpeg exit
 * classification. Framework-free (no Hono/Next imports) so both
 * apps/api and apps/web can depend on this package.
 */

export const ERROR_CODES = [
  // Client errors (4xx)
  "VALIDATION_FAILED",
  "INVALID_JSON",
  "INVALID_MULTIPART",
  "FILE_REQUIRED",
  "UPLOAD_NOT_FOUND",
  "UPLOAD_INCOMPLETE",
  "CHUNK_INVALID",
  "QUEUE_FULL",
  "JOB_NOT_FOUND",
  "JOB_NOT_COMPLETED",
  "RANGE_INVALID",
  "UNSUPPORTED_MEDIA",
  "CUSTOM_ARGS_INVALID",
  "SUBTITLES_INVALID",
  "PLAN_VERSION_UNSUPPORTED",
  // Capacity errors (507 / 429)
  "QUOTA_EXCEEDED",
  "DISK_FULL",
  // Media errors (422)
  "FFPROBE_FAILED",
  "NO_AUDIO_TRACK",
  "AUDIO_FAILED",
  // Transcode failures (SSE terminal / 500)
  "TRANSCODE_FAILED",
  "TRANSCODE_CANCELLED",
  "OUTPUT_MISSING",
  "OUTPUT_EMPTY",
  // Asset/store errors
  "ASSET_NOT_FOUND",
  "STORE_ERROR",
  // Server errors (5xx)
  "INTERNAL",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/** HTTP status for each error code — single source of truth. */
export const ERROR_STATUS: Record<ErrorCode, number> = {
  VALIDATION_FAILED: 400,
  INVALID_JSON: 400,
  INVALID_MULTIPART: 400,
  FILE_REQUIRED: 400,
  UPLOAD_NOT_FOUND: 404,
  UPLOAD_INCOMPLETE: 400,
  CHUNK_INVALID: 400,
  QUEUE_FULL: 429,
  JOB_NOT_FOUND: 404,
  JOB_NOT_COMPLETED: 404,
  RANGE_INVALID: 416,
  UNSUPPORTED_MEDIA: 422,
  CUSTOM_ARGS_INVALID: 400,
  SUBTITLES_INVALID: 400,
  PLAN_VERSION_UNSUPPORTED: 400,
  QUOTA_EXCEEDED: 507,
  DISK_FULL: 507,
  FFPROBE_FAILED: 422,
  NO_AUDIO_TRACK: 422,
  AUDIO_FAILED: 422,
  TRANSCODE_FAILED: 500,
  TRANSCODE_CANCELLED: 499,
  OUTPUT_MISSING: 404,
  OUTPUT_EMPTY: 500,
  ASSET_NOT_FOUND: 404,
  STORE_ERROR: 500,
  INTERNAL: 500,
};

/**
 * Common error envelope. Every API error response uses exactly this shape:
 * structured `code` for programmatic handling, human `message`, zod `issues`
 * for validation failures, `requestId` for log correlation, `jobId` when the
 * error belongs to a job, and `details` for machine-readable extras
 * (quota bytes, queue stats, retry hints). Never carries filesystem paths.
 */
export interface ErrorEnvelope {
  code: ErrorCode;
  message: string;
  issues?: string[];
  requestId?: string;
  jobId?: string;
  details?: Record<string, unknown>;
}

export interface EnvelopeOptions {
  message: string;
  issues?: string[];
  requestId?: string;
  jobId?: string;
  details?: Record<string, unknown>;
}

/** Build an envelope body; status comes from ERROR_STATUS. */
export function errorEnvelope(
  code: ErrorCode,
  opts: EnvelopeOptions,
): ErrorEnvelope {
  const body: ErrorEnvelope = { code, message: opts.message };
  if (opts.issues?.length) body.issues = opts.issues;
  if (opts.requestId) body.requestId = opts.requestId;
  if (opts.jobId) body.jobId = opts.jobId;
  if (opts.details) body.details = opts.details;
  return body;
}

/**
 * Resolve a request ID for log correlation: honor the client's
 * `x-request-id` header when present, otherwise mint one.
 */
export function resolveRequestId(header: string | null | undefined): string {
  const v = (header ?? "").trim().slice(0, 64);
  if (v && /^[A-Za-z0-9_-]+$/.test(v)) return v;
  return crypto.randomUUID();
}

// ---------------------------------------------------------------------------
// FFmpeg exit classification. Maps process exit codes + stderr tail to an
// error code so SSE terminal states and API errors share one vocabulary.
// ---------------------------------------------------------------------------

export interface FfmpegClassification {
  code: ErrorCode;
  /** True when retrying the same job may succeed (transient/resource). */
  retryable: boolean;
  message: string;
}

const INPUT_HINT_RE =
  /invalid (data|argument)|no such file|not found|unsupport|invalid input|could not find|error opening|no video stream|no audio stream/i;
const RESOURCE_HINT_RE =
  /out of memory|cannot allocate|no space left|disk quota/i;

export function classifyFfmpegExit(
  exitCode: number | null,
  logTail?: string | null,
): FfmpegClassification {
  const tail = logTail ?? "";
  if (exitCode === 0) {
    return {
      code: "TRANSCODE_FAILED",
      retryable: false,
      message: "FFmpeg reported success.",
    };
  }
  // SIGKILL/SIGTERM — typically OOM-killer or external kill, worth a retry.
  if (exitCode === 137 || exitCode === 143) {
    return {
      code: "TRANSCODE_FAILED",
      retryable: true,
      message: `FFmpeg was killed (exit ${exitCode}); likely out of memory.`,
    };
  }
  if (RESOURCE_HINT_RE.test(tail)) {
    return {
      code: "QUOTA_EXCEEDED",
      retryable: true,
      message: "FFmpeg ran out of memory or disk space.",
    };
  }
  if (INPUT_HINT_RE.test(tail)) {
    return {
      code: "UNSUPPORTED_MEDIA",
      retryable: false,
      message: "FFmpeg could not read the input file.",
    };
  }
  return {
    code: "TRANSCODE_FAILED",
    retryable: false,
    message:
      exitCode === null || exitCode === undefined
        ? "FFmpeg failed to start."
        : `FFmpeg exited with code ${exitCode}.`,
  };
}
