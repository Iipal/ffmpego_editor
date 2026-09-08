import type { StoredFileDescriptor } from "@repo/types";
import type { LiveStatus } from "./useJobsLiveSync";

// Mirrors the B1/B2 API contract (apps/api/src/routes/video.ts):
// statuses queued|processing|completed|failed|cancelled, logTail tail log,
// queuePosition for queued jobs, queue stats on the list response.
export type JobStatus =
  | "queued"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

export interface JobEntry {
  jobId: string;
  status: JobStatus;
  progress: number;
  outputFile: StoredFileDescriptor | null;
  alternateFile?: StoredFileDescriptor | null;
  error?: string;
  logTail?: string | null;
  exitCode?: number | null;
  kind?: string;
  filename?: string;
  queuePosition?: number | null;
  createdAt: number;
  ageSeconds: number;
}

export interface QueueStats {
  active: number;
  queued: number;
  maxConcurrent: number;
  maxQueued: number;
}

export interface JobsResponse {
  count: number;
  jobs: JobEntry[];
  queue?: QueueStats;
}

export const FILTER_OPTIONS = [
  "all",
  "queued",
  "processing",
  "completed",
  "failed",
  "cancelled",
] as const;
export type Filter = (typeof FILTER_OPTIONS)[number];
export const FILTER_SET = new Set<string>(FILTER_OPTIONS); // js-set-map-lookups

export type GlobalHandler = (e: Event) => void;

export type JobRowProps = {
  job: JobEntry;
  onDelete: (id: string) => void;
  onCancel: (id: string) => void;
  onDownload: (job: JobEntry) => void;
  deletePending: boolean;
  cancelPending: boolean;
};

export type JobsAreaProps = {
  total: number;
  pending: number;
  completed: number;
  failed: number;
  filter: string;
  isStale: boolean;
  isFetching: boolean;
  liveStatus: LiveStatus;
  apiBase: string;
  queue?: QueueStats;
  onRefresh: () => void;
};
