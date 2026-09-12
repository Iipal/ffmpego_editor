// Shared TanStack Query keys — one literal per key so renames and
// invalidations stay in sync across hooks, mutations, and live-sync paths.
// Canonical home (ex-`lib/query-keys.ts`): import from `@/lib/query-hooks`.
export const queryKeys = {
  adminJobs: ["admin-jobs"],
  storageStats: ["storage-stats"],
  uploadSessions: ["upload-sessions"],
  health: ["health"],
  audioAnalysis: (
    file: { name: string; size: number; lastModified: number } | null,
    trackIndex: number,
  ) => [
    "audio-analysis",
    file?.name,
    file?.size,
    file?.lastModified,
    trackIndex,
  ],
} as const;
