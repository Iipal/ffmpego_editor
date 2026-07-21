// API base URL - in production this would be an environment variable
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3100";

export async function apiPost<T>(endpoint: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export async function apiGet<T>(endpoint: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`);

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export async function apiFormPost<T>(
  endpoint: string,
  body: FormData,
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: "POST",
    body,
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(payload?.error ?? `API error: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

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

export interface TranscodeResponse {
  jobId: string;
  progressUrl: string;
}

export interface TranscodeProgress {
  status: "processing" | "completed" | "failed";
  progress: number;
  outputPath: string;
  alternateOutputPath?: string;
  error?: string;
}
