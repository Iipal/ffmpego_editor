// API base URL - in production this would be an environment variable
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3100';

export async function apiPost<T>(endpoint: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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

export interface ProcessVideoRequest {
  inputPath: string;
  format?: string;
  quality?: 'high' | 'medium' | 'low';
  startTime?: number;
  endTime?: number;
}

export interface VideoProcessResponse {
  success: boolean;
  outputPath?: string;
  error?: string;
}

export interface JobStatusResponse {
  jobId: string;
  status: string;
  progress: number;
  startTime: number;
}
