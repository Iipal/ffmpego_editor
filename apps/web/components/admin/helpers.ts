import { apiClient } from "@/lib/api-client";
import type { JobEntry, JobsResponse } from "./types";

// js-hoist-regexp: hoist RegExp to module scope (avoid per-render recreation, share mutable lastIndex safely without /g)
// JOB_ID_RE validates jobId cheaply.
export const JOB_ID_RE = /^[a-z0-9-]{4,}$/i;

// rerender-memo-with-default-value: stable default for optional callbacks
export { NOOP } from "@/lib/utils";

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

// async-cheap-condition-before-await: cheap sync guard before async fetch
// async-defer-await: AbortController + timeout started before fetch, await only where needed
// async-api-routes: note — this is a client fetch to Hono API; server route runs on Bun via Bun.spawn (see apps/api)
export async function fetchJobs(): Promise<JobsResponse> {
  // cheap condition first — avoid network if base URL missing (saves 4s timeout)
  const baseUrl = apiClient.baseUrl;
  if (!baseUrl || typeof baseUrl !== "string" || baseUrl.length === 0) {
    throw new Error("API base URL not configured");
  }
  // defer await: start timeout synchronously before any await
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    // async-parallel note: if we needed health + jobs, we'd do Promise.all([fetchJobs, fetchHealth]) — not here (single resource)
    // async-dependencies note: jobs -> progress per job would chain via better-all / Promise.all(map(...then))
    // async-suspense-boundaries: page is client-polling via useQuery (SWR dedup), not RSC Suspense; streaming not applicable here
    const res = await fetch(apiClient.url("/api/transcode/jobs"), {
      signal: controller.signal,
    });
    if (!res.ok) {
      // defer expensive text read until branch actually taken
      const text = await res.text().catch(() => "");
      throw new Error(
        `Failed to fetch jobs: ${res.status} ${text.slice(0, 200)}`,
      );
    }
    return (await res.json()) as JobsResponse;
  } catch (e) {
    if ((e as Error).name === "AbortError")
      throw new Error(
        `Fetch timeout to ${apiClient.url("/api/transcode/jobs")} (API not reachable)`,
      );
    throw e;
  } finally {
    clearTimeout(timeout);
  }
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
