export interface FFprobeReport {
  format?: Record<string, unknown>;
  streams?: Array<Record<string, unknown>>;
  programs?: Array<Record<string, unknown>>;
  chapters?: Array<Record<string, unknown>>;
  frames?: Array<Record<string, unknown>>;
  packets?: Array<Record<string, unknown>>;
  packets_and_frames?: Array<Record<string, unknown>>;
  program_version?: Record<string, unknown>;
  library_versions?: Array<Record<string, unknown>>;
  error?: Record<string, unknown>;
}

export interface SubtitleStyle {
  fontFamily: string;
  fontSize: number;
  color: string;
  outlineEnabled: boolean;
  outlineThickness: number;
  outlineColor: string;
  shadowEnabled: boolean;
  shadowSize: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  shadowColor: string;
  backgroundEnabled: boolean;
  backgroundColor: string;
  backgroundPadding: number;
  backgroundBorderRadius: number;
}

export interface Subtitle {
  id: string;
  text: string;
  startTime: number;
  endTime: number;
  track: number;
  position: { x: number; y: number };
  style: SubtitleStyle;
}

export interface SubtitleTemplate {
  id: string;
  name: string;
  style: SubtitleStyle;
}

export interface TranscodeResponse {
  jobId: string;
  progressUrl: string;
}

/**
 * Opaque file descriptor — mirrors apps/api FileDescriptor.
 * Absolute store paths never leave the server; clients get id/name/size/mime.
 */
export interface StoredFileDescriptor {
  id: string;
  role: "asset" | "artifact";
  kind:
    | "upload"
    | "request-input"
    | "output"
    | "alternate-output"
    | "subtitle-png"
    | "ephemeral";
  name: string;
  byteSize: number;
  mime: string;
  ext: string;
  createdAt: number;
  expiresAt: number | null;
}

export interface TranscodeProgress {
  status: "queued" | "processing" | "completed" | "failed" | "cancelled";
  progress: number;
  outputFile: StoredFileDescriptor | null;
  alternateFile?: StoredFileDescriptor | null;
  error?: string;
  logTail?: string | null;
  exitCode?: number | null;
  queuePosition?: number | null;
  jobId: string;
}
