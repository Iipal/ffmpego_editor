import { API_BASE_URL } from "@/lib/api-client";
import type { JobEntry, JobsResponse } from "./types";
import { createGlobalListenerBus } from "@/lib/global-listener-bus";

// js-hoist-regexp: hoist RegExp to module scope (avoid per-render recreation, share mutable lastIndex safely without /g)
// FILENAME_SANITIZE_RE reused for any future filename handling; JOB_ID_RE validates jobId cheaply.
export { FILENAME_SANITIZE_RE } from "@/lib/video-file";
export const JOB_ID_RE = /^[a-z0-9-]{4,}$/i;

// rerender-memo-with-default-value: stable default for optional callbacks
export { NOOP } from "@/lib/utils";

// js-cache-function-results: module-level caches for pure functions (avoid recompute per row)
export const formatAgeCache = new Map<number, string>();
export const statusBadgeCache = new Map<string, string>();
export const statusBadgeRaw: Record<string, string> = {
  processing:
    "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900",
  completed:
    "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900",
  failed:
    "bg-red-100 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-900",
};

// client-event-listeners: dedup global listeners (single listener for N JobRow instances)
// Backed by the shared bus factory (lib/global-listener-bus).
// client-passive-event-listeners: passive where preventDefault not needed (scroll tracking)
const scrollBus = createGlobalListenerBus<Event>(
  { passive: true } as AddEventListenerOptions,
  "scroll",
);
const touchBus = createGlobalListenerBus<Event>(
  { passive: true } as AddEventListenerOptions,
  "touchstart",
);
export const globalScrollHandlers = scrollBus.handlers;
export const globalTouchHandlers = touchBus.handlers;
export function ensureGlobalListeners() {
  scrollBus.ensureAttached();
  touchBus.ensureAttached();
}

// js-cache-storage: versioned localStorage with Map cache + try-catch (client-localstorage-schema)
export const FILTER_STORAGE_KEY = "admin-filter:v1";
export const filterStorageCache = new Map<string, string | null>();
export function getCachedFilter(): string | null {
  if (filterStorageCache.has(FILTER_STORAGE_KEY))
    return filterStorageCache.get(FILTER_STORAGE_KEY)!;
  try {
    const v =
      typeof window !== "undefined"
        ? window.localStorage.getItem(FILTER_STORAGE_KEY)
        : null;
    filterStorageCache.set(FILTER_STORAGE_KEY, v);
    return v;
  } catch {
    filterStorageCache.set(FILTER_STORAGE_KEY, null);
    return null;
  }
}
export function setCachedFilter(v: string) {
  filterStorageCache.set(FILTER_STORAGE_KEY, v);
  try {
    const schedule =
      typeof window !== "undefined" && "requestIdleCallback" in window
        ? (cb: () => void) =>
            (
              window as unknown as {
                requestIdleCallback: (cb: () => void) => number;
              }
            ).requestIdleCallback(cb)
        : (cb: () => void) => setTimeout(cb, 0);
    // js-request-idle-callback: defer non-critical persistence to idle
    schedule(() => {
      try {
        window.localStorage.setItem(FILTER_STORAGE_KEY, v);
      } catch {}
    });
  } catch {
    try {
      window.localStorage.setItem(FILTER_STORAGE_KEY, v);
    } catch {}
  }
}

// async-cheap-condition-before-await: cheap sync guard before async fetch
// async-defer-await: AbortController + timeout started before fetch, await only where needed
// async-api-routes: note — this is a client fetch to Hono API; server route runs on Bun via Bun.spawn (see apps/api)
export async function fetchJobs(): Promise<JobsResponse> {
  // cheap condition first — avoid network if base URL missing (saves 4s timeout)
  if (
    !API_BASE_URL ||
    typeof API_BASE_URL !== "string" ||
    API_BASE_URL.length === 0
  ) {
    throw new Error("API_BASE_URL not configured");
  }
  // defer await: start timeout synchronously before any await
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    // async-parallel note: if we needed health + jobs, we'd do Promise.all([fetchJobs, fetchHealth]) — not here (single resource)
    // async-dependencies note: jobs -> progress per job would chain via better-all / Promise.all(map(...then))
    // async-suspense-boundaries: page is client-polling via useQuery (SWR dedup), not RSC Suspense; streaming not applicable here
    const res = await fetch(`${API_BASE_URL}/api/transcode/jobs`, {
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
        `Fetch timeout to ${API_BASE_URL}/api/transcode/jobs (API not reachable)`,
      );
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}

// js-cache-function-results + js-cache-property-access + js-early-exit
export function formatAge(seconds: number): string {
  // js-early-exit + length/ cheap guard not needed but cache lookup first
  if (formatAgeCache.has(seconds)) return formatAgeCache.get(seconds)!;
  let out: string;
  if (seconds < 60) out = `${seconds}s`;
  else {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (m < 60) out = `${m}m ${s}s`;
    else {
      const h = Math.floor(m / 60);
      out = `${h}h ${m % 60}m`;
    }
  }
  formatAgeCache.set(seconds, out);
  return out;
}

export function statusBadge(status: JobEntry["status"]): string {
  if (statusBadgeCache.has(status)) return statusBadgeCache.get(status)!;
  const v =
    statusBadgeRaw[status] ??
    "bg-kumo-recessed text-kumo-subtle border-kumo-line";
  statusBadgeCache.set(status, v);
  return v;
}
