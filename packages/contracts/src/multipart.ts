/**
 * Canonical multipart field names + headers/query params. Routes read and
 * the web app writes using these constants so field renames stay in sync.
 */
export const MULTIPART_FIELDS = {
  /** JSON settings payload (render plan v0 bare settings or v1 wrapper). */
  settings: "settings",
  /** Source video file. */
  file: "file",
  /** Chunked-upload session id (multipart field fallback). */
  uploadId: "uploadId",
  /** Subtitles metadata JSON (array of {text,startTime,endTime,...}). */
  subtitles: "subtitles",
  /** Alias for `subtitles` (accepted for backwards compatibility). */
  subtitlesMeta: "subtitlesMeta",
  /** snake_case alias for `subtitles`. */
  subtitles_meta: "subtitles_meta",
  /** Prefix for per-subtitle PNG overlay files (`subtitle_0`, ...). */
  subtitleFilePrefix: "subtitle",
} as const;

/** Chunked-upload session carried outside multipart (preferred). */
export const UPLOAD_ID_HEADER = "x-upload-id";
export const UPLOAD_ID_QUERY = "uploadId";

/** Request-id correlation header (see errors.resolveRequestId). */
export const REQUEST_ID_HEADER = "x-request-id";

export type MultipartField = (typeof MULTIPART_FIELDS)[keyof typeof MULTIPART_FIELDS];
