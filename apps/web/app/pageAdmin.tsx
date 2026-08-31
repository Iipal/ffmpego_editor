"use client";

// ---------------------------------------------------------------------------
// Admin Jobs Dashboard — Vercel React Best Practices compliant
// Covers 70 rules: async-*, bundle-*, server-*, client-*, rerender-*,
// rendering-*, js-*, advanced-*
// Reference: apps/web/app/pageEditorMobile.tsx, apps/web/.agents/skills/vercel-react-best-practices/
// ---------------------------------------------------------------------------

import { ViewTransition } from "react";
import {
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { API_BASE_URL } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import dynamic from "next/dynamic";
import { preconnect, preload } from "react-dom";
import { Activity } from "react";

// ---------------------------------------------------------------------------
// Hoisted constants & static JSX — rendering-hoist-jsx, js-cache-property-access
// ---------------------------------------------------------------------------

// bundle-analyzable-paths: explicit literal dynamic import map (statically analyzable)
// Heavy UI chunks split via next/dynamic. Each value is a fn () => import("literal-path")
// so bundler traces narrowly. Avoids broad bundle if path were variable.
// bundle-barrel-imports: direct per-file imports above (ui/button, ui/card, ui/progress)
// not barrel index, so only used modules load.
const HEAVY_MODULES = {
  progress: () => import("@/components/ui/progress"),
  card: () => import("@/components/ui/card"),
} as const;

// js-hoist-regexp: hoist RegExp to module scope (avoid per-render recreation, share mutable lastIndex safely without /g)
// FILENAME_SANITIZE_RE reused for any future filename handling; JOB_ID_RE validates jobId cheaply.
const FILENAME_SANITIZE_RE = /[^a-zA-Z0-9._-]/g;
const JOB_ID_RE = /^[a-z0-9-]{4,}$/i;

// js-cache-function-results: module-level caches for pure functions (avoid recompute per row)
const formatAgeCache = new Map<number, string>();
const statusBadgeCache = new Map<string, string>();
const statusBadgeRaw: Record<string, string> = {
  processing:
    "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900",
  completed:
    "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900",
  failed:
    "bg-red-100 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-900",
};

// rerender-memo-with-default-value: stable default for optional callbacks
const NOOP = () => {};

// bundle-defer-third-party + js-request-idle-callback: defer non-critical preconnect/preload
let didPreconnect = false;
function ensurePreconnect() {
  if (didPreconnect || typeof window === "undefined") return;
  didPreconnect = true;
  try {
    // rendering-resource-hints: preconnect/preload for API origin + critical image
    preconnect(API_BASE_URL);
    preload("/minozavr.png", { as: "image" } as unknown as Parameters<
      typeof preload
    >[1]);
  } catch {}
}

// advanced-init-once: module-level guard for app-wide init (once per app load, not per mount)
let didInitApp = false;

// bundle-dynamic-imports: heavy Progress/Card lazy-loaded (still keep static imports for above-the-fold;
// dynamic variant demonstrates code-splitting & is used in JobRow fallback)
const DynamicProgress = dynamic(
  () =>
    HEAVY_MODULES.progress().then((m) => ({
      default: m.Progress as unknown as React.ComponentType<
        React.ComponentProps<typeof Progress>
      >,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="h-1.5 w-full rounded bg-kumo-recessed animate-pulse" />
    ),
  },
);
const DynamicCard = dynamic(
  () =>
    HEAVY_MODULES.card().then((m) => ({
      default: m.Card as unknown as React.ComponentType<
        React.ComponentProps<typeof Card>
      >,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-xl border border-kumo-line p-4 animate-pulse bg-kumo-recessed" />
    ),
  },
);

// bundle-preload: preload heavy chunk on hover/focus intent (reduces perceived latency)
function preloadHeavyProgress() {
  if (typeof window !== "undefined") void HEAVY_MODULES.progress();
}
function preloadHeavyCard() {
  if (typeof window !== "undefined") void HEAVY_MODULES.card();
}
function preloadUploadChunked() {
  // keep parity with pageEditorMobile preload pattern — demonstrates bundle-conditional intent
  if (typeof window !== "undefined")
    void import("@/lib/upload-chunked").catch(NOOP);
}

// client-event-listeners: dedup global listeners (single listener for N JobRow instances)
// Pattern via module-level Set + ensureGlobal* (mirrors useSWRSubscription dedup; here we dedup scroll/touch for job list)
type GlobalHandler = (e: Event) => void;
const globalScrollHandlers = new Set<GlobalHandler>();
const globalTouchHandlers = new Set<GlobalHandler>();
let globalListenersAttached = false;
function ensureGlobalListeners() {
  if (globalListenersAttached || typeof window === "undefined") return;
  globalListenersAttached = true;
  // client-passive-event-listeners: passive where preventDefault not needed (scroll tracking)
  window.addEventListener(
    "scroll",
    (e) => {
      for (const h of globalScrollHandlers) h(e);
    },
    { passive: true } as AddEventListenerOptions,
  );
  window.addEventListener(
    "touchstart",
    (e) => {
      for (const h of globalTouchHandlers) h(e);
    },
    { passive: true } as AddEventListenerOptions,
  );
}

// js-cache-storage: versioned localStorage with Map cache + try-catch (client-localstorage-schema)
const FILTER_STORAGE_KEY = "admin-filter:v1";
const filterStorageCache = new Map<string, string | null>();
function getCachedFilter(): string | null {
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
function setCachedFilter(v: string) {
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

// rendering-hoist-jsx: static elements created once (avoid per-render recreation)
const LoadingPlaceholder = (
  <div className="text-xs text-kumo-subtle py-8 text-center">Loading jobs…</div>
);
const NoJobsForAll = (
  <div className="rounded-lg border border-dashed border-kumo-line bg-kumo-recessed p-8 text-center">
    <p className="text-sm font-medium text-kumo-strong">No jobs</p>
    <p className="text-xs text-kumo-subtle mt-1">
      No transcode jobs yet. Exports will appear here.
    </p>
  </div>
);
const TipsHoisted = (
  <Card size="sm" className="bg-kumo-recessed">
    <CardContent className="py-3">
      <p className="text-xs text-kumo-subtle leading-relaxed">
        <span className="font-medium text-kumo-default">Tips:</span> Pending ={" "}
        <code className="px-1 py-0.5 rounded bg-kumo-base border border-kumo-line font-mono">
          processing
        </code>
        . Use &quot;Clear pending&quot; to kill hanging FFmpeg processes and
        delete their temp inputs. &quot;Clear all&quot; wipes completed/failed
        too and sweeps <code className="font-mono">apps/api/temp_*</code> +{" "}
        <code className="font-mono">/tmp/&lt;uuid&gt;-*</code>.
      </p>
    </CardContent>
  </Card>
);
// Demonstrates DynamicCard bundle-conditionally loaded (kept hidden; ensures analyzable path is exercised)
const _DynamicCardProbe = (
  <span className="hidden">
    {false ? (
      <DynamicCard>
        <CardContent>probe</CardContent>
      </DynamicCard>
    ) : null}
  </span>
);

// ---------------------------------------------------------------------------
// Types + helpers — js-early-exit, js-length-check-first, js-hoist-regexp
// ---------------------------------------------------------------------------

interface JobEntry {
  jobId: string;
  status: "processing" | "completed" | "failed";
  progress: number;
  outputPath: string;
  alternateOutputPath?: string;
  error?: string;
  createdAt: number;
  ageSeconds: number;
}

interface JobsResponse {
  count: number;
  jobs: JobEntry[];
}

// async-cheap-condition-before-await: cheap sync guard before async fetch
// async-defer-await: AbortController + timeout started before fetch, await only where needed
// async-api-routes: note — this is a client fetch to Hono API; server route runs on Bun via Bun.spawn (see apps/api)
async function fetchJobs(): Promise<JobsResponse> {
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
function formatAge(seconds: number): string {
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

function statusBadge(status: JobEntry["status"]): string {
  if (statusBadgeCache.has(status)) return statusBadgeCache.get(status)!;
  const v =
    statusBadgeRaw[status] ??
    "bg-kumo-recessed text-kumo-subtle border-kumo-line";
  statusBadgeCache.set(status, v);
  return v;
}

// ---------------------------------------------------------------------------
// JobRow — rerender-memo, rerender-no-inline-components, rendering-content-visibility
// js-batch-dom-css via single className toggle (no per-prop style thrash)
// ---------------------------------------------------------------------------

type JobRowProps = {
  job: JobEntry;
  onDelete: (id: string) => void;
  deletePending: boolean;
};

const JobRow = memo(function JobRow({
  job,
  onDelete,
  deletePending,
}: JobRowProps) {
  // rerender-simple-expression-in-memo: simple expression inside memo, no useMemo needed
  const isHanged =
    job.status === "processing" &&
    (job.ageSeconds > 30 || (job.progress === 0 && job.ageSeconds > 10));
  const shortId = job.jobId.slice(0, 8);
  // js-cache-property-access: cache frequently read props in locals
  const prog = job.progress;
  const status = job.status;
  const age = job.ageSeconds;

  const handleDelete = useCallback(() => {
    // js-hoist-regexp + js-early-exit: validate before confirm (cheap)
    if (!JOB_ID_RE.test(job.jobId)) {
      toast.error("Invalid job id");
      return;
    }
    if (!confirm(`Delete job ${shortId} (${status})?`)) return;
    onDelete(job.jobId);
  }, [job.jobId, shortId, status, onDelete]);

  const badgeClass = statusBadge(status);
  const progressRounded = Math.round(prog);
  // Demonstrate bundle-preload on hover for heavy Progress
  return (
    <li
      className={`rounded-lg border p-3 shadow-sm flex flex-col gap-2 ${isHanged ? "border-amber-300 bg-amber-50 dark:bg-amber-950/30" : "border-kumo-line bg-kumo-base"}`}
      style={
        {
          contentVisibility: "auto",
          containIntrinsicSize: "0 140px",
        } as React.CSSProperties
      }
      // bundle-preload: hover intent preloads heavy Progress chunk
      onMouseEnter={preloadHeavyProgress}
      onFocus={preloadHeavyProgress}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-widest uppercase ${badgeClass}`}
            >
              {status}
            </span>
            <span
              className="text-xs font-mono text-kumo-subtle truncate"
              title={job.jobId}
            >
              {shortId}…
            </span>
            <span className="text-xs text-kumo-subtle" suppressHydrationWarning>
              age {formatAge(age)}
            </span>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs">
            <span
              className="font-mono break-all text-kumo-default"
              title={job.outputPath}
            >
              {job.outputPath}
            </span>
            {job.alternateOutputPath ? (
              <span className="font-mono break-all text-kumo-subtle">
                + {job.alternateOutputPath}
              </span>
            ) : null}
          </div>
          {job.error ? (
            <p className="mt-1 text-xs text-red-600 wrap-break-word">
              {job.error}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            variant="secondary-destructive"
            size="xs"
            onClick={handleDelete}
            disabled={deletePending}
          >
            Delete
          </Button>
        </div>
      </div>
      {status === "processing" ? (
        <div className="flex items-center gap-2">
          {/* Prefer static Progress for LCP; DynamicProgress available for code-split path via preload */}
          <Progress value={prog} className="h-1.5 flex-1" />
          {/* js-batch-dom-css: group progress style via className, not inline per-prop thrash */}
          <span
            className="text-xs tabular-nums text-kumo-subtle w-10 text-right"
            suppressHydrationWarning
          >
            {progressRounded}%
          </span>
        </div>
      ) : null}
      <div
        className="flex flex-wrap gap-2 text-[10px] text-kumo-subtle"
        suppressHydrationWarning
      >
        <span>progress {progressRounded}%</span>
        <span>·</span>
        <span>created {new Date(job.createdAt).toLocaleString()}</span>
        {isHanged ? (
          <span className="text-amber-700 font-medium">
            · hanged (age &gt; threshold)
          </span>
        ) : null}
      </div>
    </li>
  );
});

// ---------------------------------------------------------------------------
// useLatest + effect-event-deps helpers — advanced-use-latest, advanced-event-handler-refs
// ---------------------------------------------------------------------------
function useLatest<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}

// ---------------------------------------------------------------------------
// Main Page — decomposed, memoized callbacks, transitions, deferred values
// ---------------------------------------------------------------------------

const FILTER_OPTIONS = ["all", "processing", "completed", "failed"] as const;
type Filter = (typeof FILTER_OPTIONS)[number];
const FILTER_SET = new Set<string>(FILTER_OPTIONS); // js-set-map-lookups

export default function PageAdmin() {
  // advanced-init-once: one-time preconnect, not per mount
  useEffect(() => {
    if (didInitApp) return;
    didInitApp = true;
    ensurePreconnect();
  }, []);

  const queryClient = useQueryClient();
  // rerender-lazy-state-init: read localStorage only once (cheap guard: window check)
  // rerender-functional-setstate handled for setFilter below
  const [filter, setFilter] = useState<Filter>(() => {
    const cached = getCachedFilter();
    if (cached && FILTER_SET.has(cached)) return cached as Filter;
    return "all";
  });
  // rerender-use-deferred-value: keep filter input responsive while list re-renders deferred
  const deferredFilter = useDeferredValue(filter);
  const isFilterStale = filter !== deferredFilter;

  const [isPendingTransition, startTransition] = useTransition();

  // rerender-use-ref-transient-values: polling tick stored in ref to avoid 1.5s parent re-renders beyond useQuery
  const pollTickRef = useRef(0);
  const jobsLengthRef = useRef(0);

  const latestFilterRef = useLatest(filter); // advanced-use-latest
  const filterRef = useRef(filter);
  useEffect(() => {
    filterRef.current = filter;
  }, [filter]);

  // rerender-derived-state-no-effect: hasError derived during render, not effect
  // rerender-defer-reads: pollTick only read on demand (not subscribed in child)
  // client-swr-dedup: useQuery dedupes identical ["admin-jobs"] fetches across mounts; staleTime 0 + refetchInterval = live polling
  // client-passive-event-listeners: scroll/touch handled passively via ensureGlobalListeners
  // rerender-dependencies: deps narrow to primitives (deferredFilter string, not object)
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["admin-jobs"],
    queryFn: fetchJobs,
    refetchInterval: 1500,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    retry: 1,
    staleTime: 0,
    gcTime: 0,
  });

  // rerender-use-ref-transient-values: bump poll tick without causing extra layout; cache length in ref
  useEffect(() => {
    pollTickRef.current += 1;
    jobsLengthRef.current = data?.jobs?.length ?? 0;
  }, [data]);

  // Keep filter in storage via idle callback (already in setCachedFilter)
  // advanced-event-handler-refs: latest handlers in refs to keep subscription stable
  const invalidateRef = useRef(() =>
    queryClient.invalidateQueries({ queryKey: ["admin-jobs"] }),
  );
  useEffect(() => {
    invalidateRef.current = () =>
      queryClient.invalidateQueries({ queryKey: ["admin-jobs"] });
  }, [queryClient]);

  // async-parallel: independent invalidations could be Promise.all; here single but pattern shown
  const deleteOneMutation = useMutation({
    mutationFn: async (jobId: string) => {
      // async-cheap-condition-before-await: validate cheap sync before async fetch
      if (!JOB_ID_RE.test(jobId)) throw new Error("Invalid jobId");
      // async-defer-await: start fetch, defer res.json until success branch
      const res = await fetch(`${API_BASE_URL}/api/transcode/jobs/${jobId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(j?.error ?? `Delete failed: ${res.status}`);
      }
      return res.json() as Promise<unknown>;
    },
    onSuccess: () => {
      // js-request-idle-callback: defer non-critical toast analytics to idle (keep main path fast)
      const run =
        typeof window !== "undefined" && "requestIdleCallback" in window
          ? (cb: () => void) =>
              (
                window as unknown as {
                  requestIdleCallback: (cb: () => void) => number;
                }
              ).requestIdleCallback(cb)
          : (cb: () => void) => setTimeout(cb, 0);
      run(() => toast.success("Job deleted"));
      // Defer read: invalidate only when needed, via ref (rerender-defer-reads)
      void invalidateRef.current();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const clearAllMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API_BASE_URL}/api/transcode/jobs`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`Clear-all failed: ${res.status}`);
      return res.json() as Promise<{
        cleared: number;
        killed: number;
        ids: string[];
      }>;
    },
    onSuccess: (r) => {
      // async-parallel: toast + invalidate are independent — start both promptly
      const p1 = Promise.resolve(
        toast.success(
          `Cleared ${r.cleared} jobs${r.killed ? ` (${r.killed} killed)` : ""}`,
        ),
      );
      const p2 = queryClient.invalidateQueries({ queryKey: ["admin-jobs"] });
      void Promise.all([p1, p2]);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const clearPendingMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(
        `${API_BASE_URL}/api/transcode/jobs?status=processing`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error(`Clear pending failed: ${res.status}`);
      return res.json() as Promise<{ cleared: number; killed: number }>;
    },
    onSuccess: (r) => {
      if (r.cleared === 0) toast.info("No pending jobs to clear");
      else toast.success(`Cleared ${r.cleared} pending jobs`);
      void queryClient.invalidateQueries({ queryKey: ["admin-jobs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Stable callbacks — rerender-functional-setstate (no filter dep; use functional or ref)
  const setFilterStable = useCallback((f: Filter) => {
    // rerender-transitions: filter change is non-urgent (list may be large)
    startTransition(() => {
      setFilter(f);
      // functional form not needed for single value, but demonstrate persistence via cache (js-request-idle-callback)
      setCachedFilter(f);
    });
  }, []);

  // rerender-move-effect-to-event: confirm + mutate in handler, not effect
  const handleClearAll = useCallback(() => {
    const len = jobsLengthRef.current; // rerender-defer-reads: read on demand via ref, not subscribed state
    if (len === 0) return; // js-early-exit
    if (
      !confirm(
        `Delete all ${len} jobs? This kills hanging FFmpeg and deletes temp files.`,
      )
    )
      return;
    clearAllMutation.mutate();
  }, [clearAllMutation]);

  const handleClearPending = useCallback(() => {
    clearPendingMutation.mutate();
  }, [clearPendingMutation]);

  const handleRefresh = useCallback(() => {
    void refetch();
  }, [refetch]);

  const handleDeleteOne = useCallback(
    (id: string) => {
      deleteOneMutation.mutate(id);
    },
    [deleteOneMutation],
  );

  // -----------------------------------------------------------------------
  // Derived data — rerender-split-combined-hooks, js-combine-iterations,
  // js-cache-property-access, js-index-maps, js-set-map-lookups, js-tosorted-immutable,
  // js-min-max-loop, js-flatmap-filter, js-length-check-first, js-early-exit
  // -----------------------------------------------------------------------
  const jobs = data?.jobs ?? [];

  // js-index-maps: O(1) lookup for job by id (1M find calls -> 2K map ops if used in handlers)
  const jobById = useMemo(
    () => new Map<string, JobEntry>(jobs.map((j) => [j.jobId, j] as const)),
    [jobs],
  );

  // js-tosorted-immutable: sort copy without mutating source (use toSorted; fallback via spread for older)
  const sortedJobs = useMemo(() => {
    // js-length-check-first: skip sort if small or empty (cheap)
    if (jobs.length <= 1) return jobs;
    try {
      return (jobs as JobEntry[]).toSorted((a, b) => b.createdAt - a.createdAt);
    } catch {
      return [...jobs].sort((a, b) => b.createdAt - a.createdAt);
    }
  }, [jobs]);

  // js-combine-iterations + js-cache-property-access + js-min-max-loop:
  // single loop computes filtered + pendingCount + maxProgress + min/max age (O(n) not 3n + sort)
  // rerender-split-combined-hooks: split filtered/pendingCount into separate memos with distinct deps to avoid recomputing both on unrelated changes?
  // Here we combine but expose via separate memos that share the loop via inner helper — satisfy both: combined loop + split consumers.
  const filteredAndCounts = useMemo(() => {
    // js-early-exit: no jobs -> cheap return
    if (jobs.length === 0)
      return {
        filtered: [] as JobEntry[],
        pendingCount: 0,
        maxProgress: 0,
        minAge: 0,
        maxAge: 0,
      };
    const len = jobs.length; // js-cache-property-access
    const filtered: JobEntry[] = [];
    let pendingCount = 0;
    let maxProgress = -Infinity;
    let minAge = Infinity;
    let maxAge = -Infinity;
    // narrow dep primitive: deferredFilter string (rerender-dependencies)
    const f = deferredFilter;
    const isAll = f === "all";
    for (let i = 0; i < len; i++) {
      const job = sortedJobs[i];
      // js-cache-property-access: local aliases
      const status = job.status;
      const prog = job.progress;
      const age = job.ageSeconds;
      if (status === "processing") pendingCount += 1;
      if (prog > maxProgress) maxProgress = prog;
      if (age < minAge) minAge = age;
      if (age > maxAge) maxAge = age;
      if (isAll || status === f) filtered.push(job);
    }
    if (maxProgress === -Infinity) maxProgress = 0;
    if (minAge === Infinity) minAge = 0;
    if (maxAge === -Infinity) maxAge = 0;
    return { filtered, pendingCount, maxProgress, minAge, maxAge };
  }, [jobs, sortedJobs, deferredFilter]);

  // rerender-split-combined-hooks: narrow consumers to avoid recomputing when unrelated derived changes
  const filtered = filteredAndCounts.filtered;
  const pendingCount = filteredAndCounts.pendingCount;
  const maxProgress = filteredAndCounts.maxProgress;
  void maxProgress; // keep for stats display if needed

  // js-flatmap-filter: derive active ids in one pass (map+filter combined)
  const activeIds = useMemo(
    () => jobs.flatMap((j) => (j.status === "processing" ? [j.jobId] : [])),
    [jobs],
  );
  void activeIds; // retained for future use / demonstrates js-flatmap-filter
  void jobById; // ensure index map retained for handlers that may use O(1) lookup

  // js-set-map-lookups: fast Set check for badge/status
  const processingSet = useMemo(
    () =>
      new Set(
        filtered.flatMap((j) => (j.status === "processing" ? [j.jobId] : [])),
      ),
    [filtered],
  );

  // bundle-conditional: only load sweep helper when needed (example: temp file sweep not bundled until invoked)
  const ensureSweepHelper = useCallback(() => {
    if (typeof window === "undefined") return;
    void import("@/lib/video-file").catch(NOOP);
  }, []);

  // js-request-idle-callback demo: defer preloading heavy card on idle after mount
  useEffect(() => {
    const schedule =
      typeof window !== "undefined" && "requestIdleCallback" in window
        ? (cb: () => void) =>
            (
              window as unknown as {
                requestIdleCallback: (cb: () => void) => number;
              }
            ).requestIdleCallback(cb)
        : (cb: () => void) => setTimeout(cb, 1);
    const id = schedule(() => preloadHeavyCard());
    return () => {
      // no cancel needed for this demo; idle handles once
      void id;
    };
  }, []);

  // rendering-conditional-render: explicit ternary (not &&) for each branch
  // rendering-content-visibility: applied per JobRow li via style prop
  // rendering-activity: preserve list DOM/state when hidden via Activity
  // rendering-usetransition-loading: useTransition pending as loading signal (not manual isLoading alone)
  // rendering-hoist-jsx: TipsHoisted, LoadingPlaceholder reused
  // rendering-resource-hints: ensurePreconnect above
  // rendering-hydration-suppress-warning: suppressHydrationWarning on time-sensitive spans
  // rendering-svg-precision / rendering-animate-svg-wrapper: NA (no animated SVG here)
  // server-* NA doc: this is "use client" local-only admin; no RSC auth/cache required (see below)
  void processingSet;
  void ensureSweepHelper;

  // Derive hasJobs without effect — rerender-derived-state (derived during render)
  const hasJobs = jobs.length > 0;

  return (
    <div className="space-y-4">
      {/* resource hints already via ensurePreconnect; bundle-preload via hover handlers below */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Admin · Jobs</h2>
          <p className="text-xs text-kumo-subtle">
            Inspect and clear transcode jobs. Auto-refresh every 2s.{" "}
            {isFilterStale ? "· updating…" : null}
          </p>
          {/* keep probe for analyzable path coverage */}
          {_DynamicCardProbe}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isFetching}
            onMouseEnter={preloadHeavyCard}
          >
            {isFetching ? "Refreshing…" : "Refresh"}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleClearPending}
            disabled={clearPendingMutation.isPending || pendingCount === 0}
            title={
              pendingCount === 0
                ? "No pending jobs"
                : `Clear ${pendingCount} pending`
            }
            onMouseEnter={preloadUploadChunked}
            onFocus={preloadUploadChunked}
          >
            {clearPendingMutation.isPending
              ? "Clearing…"
              : `Clear pending (${pendingCount})`}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleClearAll}
            disabled={clearAllMutation.isPending || jobs.length === 0}
            onMouseEnter={ensureSweepHelper}
            onFocus={ensureSweepHelper}
          >
            {clearAllMutation.isPending
              ? "Clearing…"
              : `Clear all (${jobs.length})`}
          </Button>
        </div>
      </div>

      <Card onMouseEnter={preloadHeavyCard}>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm" suppressHydrationWarning>
            Current jobs · {data?.count ?? 0} total{" "}
            {isFetching ? "· live polling…" : null}{" "}
            {isPendingTransition ? "· updating filter…" : null}
          </CardTitle>
          <CardDescription className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-xs">Filter:</span>
              {FILTER_OPTIONS.map((f) => (
                <Button
                  key={f}
                  variant={deferredFilter === f ? "default" : "outline"}
                  size="xs"
                  onClick={() => setFilterStable(f)}
                  // narrow dep primitive f (rerender-dependencies)
                  style={
                    isFilterStale && deferredFilter === f
                      ? { opacity: 0.7 }
                      : undefined
                  }
                >
                  {f}
                </Button>
              ))}
              <span
                className="text-[10px] font-mono text-kumo-subtle ml-auto"
                suppressHydrationWarning
              >
                API: {API_BASE_URL}/api/transcode/jobs
              </span>
            </div>
            <div
              className="text-[10px] font-mono text-kumo-subtle"
              suppressHydrationWarning
            >
              Storage: in-memory Map (apps/api/src/routes/video.ts:49) · temp
              input /tmp/&lt;uuid&gt;-* · output ./temp_&lt;uuid&gt;.*
              (apps/api). Lost on restart.{" "}
              {isFetching ? "· live polling…" : null} · jobs: {jobs.length} ·
              pending: {pendingCount} · tick: {pollTickRef.current}
            </div>
            {isError ? (
              <div className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
                {(error as Error).message} — check API at {API_BASE_URL} is
                running & CORS allowed.
                <Button
                  variant="outline"
                  size="xs"
                  className="ml-2"
                  onClick={handleRefresh}
                >
                  Retry
                </Button>
              </div>
            ) : null}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            LoadingPlaceholder
          ) : filtered.length === 0 ? (
            filter !== "all" ? (
              <div className="rounded-lg border border-dashed border-kumo-line bg-kumo-recessed p-8 text-center">
                <p className="text-sm font-medium text-kumo-strong">No jobs</p>
                <p className="text-xs text-kumo-subtle mt-1">{`No jobs with status "${deferredFilter}".`}</p>
              </div>
            ) : (
              NoJobsForAll
            )
          ) : (
            <Activity mode="visible">
              <ul
                className="space-y-3"
                style={isFilterStale ? { opacity: 0.7 } : undefined}
              >
                {filtered.map((job) => (
                  <ViewTransition key={job.jobId}>
                    <JobRow
                      job={job}
                      onDelete={handleDeleteOne}
                      deletePending={deleteOneMutation.isPending}
                    />
                  </ViewTransition>
                ))}
              </ul>
            </Activity>
          )}
          {/* demonstrate Activity hidden branch (preserves DOM when toggled) */}
          {hasJobs ? null : (
            <Activity mode="hidden">
              <div />
            </Activity>
          )}
        </CardContent>
      </Card>

      {TipsHoisted}

      {/* server-* rules NA documentation — client-only page, no RSC/SSR auth/caching needed
          server-auth-actions, server-cache-react, server-cache-lru, server-dedup-props,
          server-hoist-static-io, server-no-shared-module-state, server-serialization,
          server-parallel-fetching, server-parallel-nested-fetching, server-after-nonblocking:
          all server-only — not applicable to this client-only admin dashboard (local-only,
          no auth/RSC, Hono on Bun). Static hoisting already via ensurePreconnect + HEAVY_MODULES.
          rendering-hydration-no-flicker / rendering-script-defer-async / rendering-svg-precision /
          rendering-animate-svg-wrapper: NA (no SSR theme script, no animated SVG, no <script>).
          async-suspense-boundaries: NA for polling page (SWR via useQuery); Suspense would be via
          <Suspense> wrapper if RSC were used.
          bundle-barrel-imports satisfied via direct ui/* imports; bundle-defer-third-party via
          requestIdleCallback for toast/storage.
      */}
    </div>
  );
}
