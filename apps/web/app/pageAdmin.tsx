"use client";

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
import { useEffect, useState } from "react";

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

async function fetchJobs(): Promise<JobsResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    // No custom headers — keeps request as simple CORS (no preflight) to avoid pending OPTIONS
    const res = await fetch(`${API_BASE_URL}/api/transcode/jobs`, {
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Failed to fetch jobs: ${res.status} ${text.slice(0, 200)}`);
    }
    return (await res.json()) as JobsResponse;
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new Error(`Fetch timeout to ${API_BASE_URL}/api/transcode/jobs (API not reachable)`);
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}

function formatAge(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function statusBadge(status: JobEntry["status"]) {
  const map: Record<string, string> = {
    processing:
      "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900",
    completed:
      "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900",
    failed:
      "bg-red-100 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-900",
  };
  return map[status] ?? "bg-kumo-recessed text-kumo-subtle border-kumo-line";
}

export default function PageAdmin() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<
    "all" | "processing" | "completed" | "failed"
  >("all");

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

  const deleteOneMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const res = await fetch(`${API_BASE_URL}/api/transcode/jobs/${jobId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? `Delete failed: ${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success("Job deleted");
      queryClient.invalidateQueries({ queryKey: ["admin-jobs"] });
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
      toast.success(
        `Cleared ${r.cleared} jobs${r.killed ? ` (${r.killed} killed)` : ""}`,
      );
      queryClient.invalidateQueries({ queryKey: ["admin-jobs"] });
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
      queryClient.invalidateQueries({ queryKey: ["admin-jobs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const jobs = data?.jobs ?? [];
  const filtered =
    filter === "all" ? jobs : jobs.filter((j) => j.status === filter);
  const pendingCount = jobs.filter((j) => j.status === "processing").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Admin · Jobs</h2>
          <p className="text-xs text-kumo-subtle">
            Inspect and clear transcode jobs. Auto-refresh every 2s.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            {isFetching ? "Refreshing…" : "Refresh"}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => clearPendingMutation.mutate()}
            disabled={clearPendingMutation.isPending || pendingCount === 0}
            title={
              pendingCount === 0
                ? "No pending jobs"
                : `Clear ${pendingCount} pending`
            }
          >
            {clearPendingMutation.isPending
              ? "Clearing…"
              : `Clear pending (${pendingCount})`}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              if (jobs.length === 0) return;
              if (
                !confirm(
                  `Delete all ${jobs.length} jobs? This kills hanging FFmpeg and deletes temp files.`,
                )
              )
                return;
              clearAllMutation.mutate();
            }}
            disabled={clearAllMutation.isPending || jobs.length === 0}
          >
            {clearAllMutation.isPending
              ? "Clearing…"
              : `Clear all (${jobs.length})`}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">
            Current jobs · {data?.count ?? 0} total
          </CardTitle>
          <CardDescription className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-xs">Filter:</span>
              {(["all", "processing", "completed", "failed"] as const).map(
                (f) => (
                  <Button
                    key={f}
                    variant={filter === f ? "default" : "outline"}
                    size="xs"
                    onClick={() => setFilter(f)}
                  >
                    {f}
                  </Button>
                ),
              )}
              <span className="text-[10px] font-mono text-kumo-subtle ml-auto">
                API: {API_BASE_URL}/api/transcode/jobs
              </span>
            </div>
            <div className="text-[10px] font-mono text-kumo-subtle">
              Storage: in-memory Map (apps/api/src/routes/video.ts:49) · temp
              input /tmp/&lt;uuid&gt;-* · output ./temp_&lt;uuid&gt;.*
              (apps/api). Lost on restart. {isFetching && "· live polling…"}
            </div>
            {isError && (
              <div className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
                {(error as Error).message} — check API at {API_BASE_URL} is
                running & CORS allowed.
                <Button
                  variant="outline"
                  size="xs"
                  className="ml-2"
                  onClick={() => refetch()}
                >
                  Retry
                </Button>
              </div>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <div className="text-xs text-kumo-subtle py-8 text-center">
              Loading jobs…
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-lg border border-dashed border-kumo-line bg-kumo-recessed p-8 text-center">
              <p className="text-sm font-medium text-kumo-strong">No jobs</p>
              <p className="text-xs text-kumo-subtle mt-1">
                {filter === "all"
                  ? "No transcode jobs yet. Exports will appear here."
                  : `No jobs with status "${filter}".`}
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {filtered.map((job) => {
                const isHanged =
                  job.status === "processing" &&
                  (job.ageSeconds > 30 ||
                    (job.progress === 0 && job.ageSeconds > 10));
                return (
                  <li
                    key={job.jobId}
                    className={`rounded-lg border p-3 shadow-sm flex flex-col gap-2 ${isHanged ? "border-amber-300 bg-amber-50 dark:bg-amber-950/30" : "border-kumo-line bg-kumo-base"}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-widest uppercase ${statusBadge(job.status)}`}
                          >
                            {job.status}
                          </span>
                          <span
                            className="text-xs font-mono text-kumo-subtle truncate"
                            title={job.jobId}
                          >
                            {job.jobId.slice(0, 8)}…
                          </span>
                          <span className="text-xs text-kumo-subtle">
                            age {formatAge(job.ageSeconds)}
                          </span>
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                          <span
                            className="font-mono break-all text-kumo-default"
                            title={job.outputPath}
                          >
                            {job.outputPath}
                          </span>
                          {job.alternateOutputPath && (
                            <span className="font-mono break-all text-kumo-subtle">
                              + {job.alternateOutputPath}
                            </span>
                          )}
                        </div>
                        {job.error && (
                          <p className="mt-1 text-xs text-red-600 wrap-break-word">
                            {job.error}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button
                          variant="secondary-destructive"
                          size="xs"
                          onClick={() => {
                            if (
                              !confirm(
                                `Delete job ${job.jobId.slice(0, 8)} (${job.status})?`,
                              )
                            )
                              return;
                            deleteOneMutation.mutate(job.jobId);
                          }}
                          disabled={deleteOneMutation.isPending}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                    {job.status === "processing" && (
                      <div className="flex items-center gap-2">
                        <Progress
                          value={job.progress}
                          className="h-1.5 flex-1"
                        />
                        <span className="text-xs tabular-nums text-kumo-subtle w-10 text-right">
                          {Math.round(job.progress)}%
                        </span>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2 text-[10px] text-kumo-subtle">
                      <span>progress {Math.round(job.progress)}%</span>
                      <span>·</span>
                      <span>
                        created {new Date(job.createdAt).toLocaleString()}
                      </span>
                      {isHanged && (
                        <span className="text-amber-700 font-medium">
                          · hanged (age &gt; threshold)
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card size="sm" className="bg-kumo-recessed">
        <CardContent className="py-3">
          <p className="text-xs text-kumo-subtle leading-relaxed">
            <span className="font-medium text-kumo-default">Tips:</span> Pending
            ={" "}
            <code className="px-1 py-0.5 rounded bg-kumo-base border border-kumo-line font-mono">
              processing
            </code>
            . Use &quot;Clear pending&quot; to kill hanging FFmpeg processes and
            delete their temp inputs. &quot;Clear all&quot; wipes
            completed/failed too and sweeps{" "}
            <code className="font-mono">apps/api/temp_*</code> +{" "}
            <code className="font-mono">/tmp/&lt;uuid&gt;-*</code>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
