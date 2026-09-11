// Central definition for accepted video inputs — keep in sync with API limits (10GB).
//
// Browsers are inconsistent about .mkv MIME: often video/x-matroska, video/matroska,
// or empty string. Editors go through the `videoFileService` singleton below
// (acceptance checks, size guards, filename helpers) instead of duplicating
// MIME/extension sets per picker.

/**
 * Singleton service owning every video-file concern: accepted MIME/extension
 * sets, acceptance + size guards for pickers, and filename helpers
 * (extension stripping, sanitizing, size formatting). All limits live here
 * (never scattered across uploaders), so pickers and guards stay consistent
 * with the API's 10 GB cap.
 */
export class VideoFileService {
  /**
   * Value for `<input accept>` — include both MIME and explicit extensions for
   * file picker parity (macOS filters by extension if MIME unsupported).
   */
  public static readonly ACCEPTED_VIDEO_INPUT_ATTR =
    "video/mp4,video/webm,video/quicktime,video/x-matroska,video/matroska,.mkv,.mp4,.webm,.mov";

  /** Human label for the accepted inputs (unsupported-format toasts). */
  public static readonly ACCEPTED_VIDEO_LABEL =
    "MP4 / WebM / MOV / MKV (Matroska)";

  /** 10 GB — matches Bun.serve maxRequestBodySize. */
  public static readonly MAX_UPLOAD_BYTES = 10 * 1024 * 1024 * 1024;

  /** MIME types accepted without needing an extension fallback. */
  private static readonly ACCEPTED_VIDEO_MIME_TYPES = new Set<string>([
    "video/mp4",
    "video/webm",
    "video/quicktime",
    "video/x-matroska",
    "video/matroska",
  ]);

  /** Extensions accepted when MIME is empty/generic (OS quirks). */
  private static readonly ACCEPTED_VIDEO_EXTENSIONS = new Set<string>([
    "mp4",
    "webm",
    "mov",
    "mkv",
  ]);

  /**
   * Sanitize for safe filenames: anything outside [a-zA-Z0-9._-] becomes "_".
   * (Single canonical copy; was duplicated in admin + mobile helpers.)
   */
  private static readonly FILENAME_SANITIZE_RE = /[^a-zA-Z0-9._-]/g;

  /**
   * Trailing-extension matcher for `stripExtension` (hoisted: runs per
   * picker/export-name call, so no per-call literal).
   */
  private static readonly EXTENSION_RE = /\.[^.]+$/;

  // ------------------------------------------------------------------ public

  /**
   * Whether the file is an accepted video input: MIME check first (covers
   * most), then extension fallback (handles empty type,
   * application/octet-stream, or OS quirks), then charset-suffixed matroska
   * (`video/x-matroska` with suffix).
   */
  public isAcceptedVideoFile(file: File): boolean {
    if (!file) return false;
    // MIME check (covers most)
    if (VideoFileService.ACCEPTED_VIDEO_MIME_TYPES.has(file.type)) return true;
    // Extension fallback — handles empty type, application/octet-stream, or OS quirks
    const ext = this.getFileExtension(file.name);
    if (ext && VideoFileService.ACCEPTED_VIDEO_EXTENSIONS.has(ext)) return true;
    // Some browsers report video/x-matroska with charset suffix
    if (file.type.startsWith("video/") && file.type.includes("matroska"))
      return true;
    return false;
  }

  /** True when the file exceeds the 10 GB API cap. */
  public isFileTooLarge(file: File): boolean {
    return file.size > VideoFileService.MAX_UPLOAD_BYTES;
  }

  /** Human size (`1.5 MB`, `2.00 GB`) for limit toasts and progress rows. */
  public formatFileSize(bytes: number): string {
    if (bytes >= 1024 * 1024 * 1024)
      return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${bytes} B`;
  }

  /**
   * Strip the last extension: "clip.mp4" -> "clip". Falls back to input when
   * empty (export-name placeholders must never render blank).
   */
  public stripExtension(name: string): string {
    return name.replace(VideoFileService.EXTENSION_RE, "") || name;
  }

  /** Replace every char outside [a-zA-Z0-9._-] with "_" for safe filenames. */
  public sanitizeFilename(name: string): string {
    return name.replace(VideoFileService.FILENAME_SANITIZE_RE, "_");
  }

  /** Lowercased extension of a filename ("" when none). */
  public getFileExtension(name: string): string {
    const parts = name.split(".");
    return parts.length > 1 ? parts.pop()!.toLowerCase() : "";
  }

  /**
   * Compare-dialog output kind from a filename: image for gif, audio for
   * mp3/wav, video otherwise. (Single canonical copy; was duplicated in
   * export-queue + export-history.)
   */
  public outputKindForName(name: string): "video" | "audio" | "image" {
    const ext = this.getFileExtension(name);
    if (ext === "gif") return "image";
    if (ext === "mp3" || ext === "wav") return "audio";
    return "video";
  }
}

/** App-wide singleton — pickers and guards use this instead of local sets. */
export const videoFileService = new VideoFileService();
