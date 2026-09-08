// API base URL - in production this would be an environment variable
import { serverErrorMessage } from "./transcode-jobs";

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
    const payload = (await response.json().catch(() => null)) as unknown;
    throw new Error(
      serverErrorMessage(payload) ?? `API error: ${response.status}`,
    );
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

export type {
  FFprobeReport,
  TranscodeProgress,
  TranscodeResponse,
} from "@repo/types";
import type {
  FFprobeReport,
  TranscodeProgress,
  TranscodeResponse,
} from "@repo/types";
