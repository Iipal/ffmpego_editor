import { getJson } from "@/lib/query-hooks/http";
import type { JobEntry, JobsResponse } from "./types";

// js-hoist-regexp: hoist RegExp to module scope (avoid per-render recreation, share mutable lastIndex safely without /g)
// JOB_ID_RE validates jobId cheaply.
export const JOB_ID_RE = /^[a-z0-9-]{4,}$/i;

// js-cache-function-results: deleted — formatAge/statusBadge are trivial
// string ops; the per-row Maps cost more than recompute at this volume.
const statusBadgeRaw: Record<string, string> = {
  queued:
    "bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-900",
  processing:
    "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900",
  completed:
    "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900",
  failed:
    "bg-red-100 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-900",
  cancelled: "bg-kumo-recessed text-kumo-subtle border-kumo-line",
};

// Admin filter persistence lives at the useAdminJobs call sites
// (storageJSON round-trips directly — read once per mount, written on change).

// Jobs list fetch for the admin `useAdminJobs` query: one axios GET with a
// short timeout (was manual AbortController + fetch — now `getJson`). Live
// updates arrive via SSE (`useJobsLiveSync`); this is initial paint +
// manual refresh only.
export async function fetchJobs(): Promise<JobsResponse> {
  return getJson<JobsResponse>("/api/transcode/jobs", {
    timeoutMs: 4000,
    label: "Jobs list",
  });
}

// js-cache-function-results + js-cache-property-access + js-early-exit
export function formatAge(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return `${m}m ${s}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export function statusBadge(status: JobEntry["status"]): string {
  return (
    statusBadgeRaw[status] ??
    "bg-kumo-recessed text-kumo-subtle border-kumo-line"
  );
}

/**
 * Save-picker plan for a server-side output file: the stored job filename
 * is a bare export name (or the source file name) while the real output
 * extension lives on the server descriptor (outputFile.name, e.g.
 * export.webm). Re-attach it so webm/mov jobs don't save with a wrong .mp4
 * extension, and offer the matching picker filter instead of the MP4-only
 * default. `nameSuffix` (e.g. "-alt") keeps alternate downloads from
 * colliding with the primary file.
 */
export function downloadPlan(
  label: string | undefined,
  serverName: string,
  nameSuffix = "",
): {
  filename: string;
  types: [{ description: string; accept: Record<string, string[]> }];
} {
  const serverExt = serverName.split(".").pop()?.toLowerCase() || "mp4";
  const rawBase = (label || serverName).split("/").pop() || serverName;
  const base = rawBase.replace(/\.(mp4|webm|mov|mkv|m4v|avi)$/i, "");
  const filename = `${base}${nameSuffix}.${serverExt}`;
  const mimeType =
    serverExt === "mp4"
      ? "video/mp4"
      : serverExt === "webm"
        ? "video/webm"
        : serverExt === "mov"
          ? "video/quicktime"
          : "application/octet-stream";
  return {
    filename,
    types: [
      {
        description: `${serverExt.toUpperCase()} video`,
        accept: { [mimeType]: [`.${serverExt}`] },
      },
    ],
  };
}
