// Central definition for accepted video inputs — keep in sync with API limits (10GB).
// Browsers are inconsistent about .mkv MIME: often video/x-matroska, video/matroska,
// or empty string. Always fall back to extension check.

export const ACCEPTED_VIDEO_MIME_TYPES = new Set<string>([
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-matroska",
  "video/matroska",
]);

export const ACCEPTED_VIDEO_EXTENSIONS = new Set<string>([
  "mp4",
  "webm",
  "mov",
  "mkv",
]);

// Value for <input accept> — include both MIME and explicit extensions for
// file picker parity (macOS filters by extension if MIME unsupported).
export const ACCEPTED_VIDEO_INPUT_ATTR =
  "video/mp4,video/webm,video/quicktime,video/x-matroska,video/matroska,.mkv,.mp4,.webm,.mov";

export const ACCEPTED_VIDEO_LABEL = "MP4 / WebM / MOV / MKV (Matroska)";

// 10 GB — matches Bun.serve maxRequestBodySize.
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024 * 1024;

export function getFileExtension(name: string): string {
  const parts = name.split(".");
  return parts.length > 1 ? (parts.pop()!.toLowerCase() ) : "";
}

export function isAcceptedVideoFile(file: File): boolean {
  if (!file) return false;
  // MIME check (covers most)
  if (ACCEPTED_VIDEO_MIME_TYPES.has(file.type)) return true;
  // Extension fallback — handles empty type, application/octet-stream, or OS quirks
  const ext = getFileExtension(file.name);
  if (ext && ACCEPTED_VIDEO_EXTENSIONS.has(ext)) return true;
  // Some browsers report video/x-matroska with charset suffix
  if (file.type.startsWith("video/") && file.type.includes("matroska")) return true;
  return false;
}

export function isFileTooLarge(file: File): boolean {
  return file.size > MAX_UPLOAD_BYTES;
}
export function formatFileSize(bytes: number): string {
  if (bytes >= MAX_UPLOAD_BYTES) return `${(bytes / (1024*1024*1024)).toFixed(2)} GB`;
  if (bytes >= 1024*1024*1024) return `${(bytes / (1024*1024*1024)).toFixed(2)} GB`;
  if (bytes >= 1024*1024) return `${(bytes / (1024*1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes/1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

// Strip the last extension: "clip.mp4" -> "clip". Falls back to input when empty.
export function stripExtension(name: string): string {
  return name.replace(/\.[^.]+$/, "") || name;
}

// Sanitize for safe filenames: anything outside [a-zA-Z0-9._-] becomes "_".
// (Single canonical copy; was duplicated in admin + mobile helpers.)
export const FILENAME_SANITIZE_RE = /[^a-zA-Z0-9._-]/g;

export function sanitizeFilename(name: string): string {
  return name.replace(FILENAME_SANITIZE_RE, "_");
}
