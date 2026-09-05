export interface JobEntry {
  jobId: string;
  status: "processing" | "completed" | "failed";
  progress: number;
  outputPath: string;
  alternateOutputPath?: string;
  error?: string;
  createdAt: number;
  ageSeconds: number;
}

export interface JobsResponse {
  count: number;
  jobs: JobEntry[];
}

export const FILTER_OPTIONS = ["all", "processing", "completed", "failed"] as const;
export type Filter = (typeof FILTER_OPTIONS)[number];
export const FILTER_SET = new Set<string>(FILTER_OPTIONS); // js-set-map-lookups

export type GlobalHandler = (e: Event) => void;

export type JobRowProps = {
  job: JobEntry;
  onDelete: (id: string) => void;
  deletePending: boolean;
};

export type JobsAreaProps = {
  total: number;
  pending: number;
  completed: number;
  failed: number;
  filter: string;
  isStale: boolean;
  isFetching: boolean;
  apiBase: string;
  onRefresh: () => void;
};
