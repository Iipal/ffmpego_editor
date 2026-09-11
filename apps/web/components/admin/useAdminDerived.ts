"use client";

import { useMemo } from "react";
import type { JobEntry } from "./types";

/**
 * Derived jobs view: newest-first sort + status filter + status counts in a
 * single O(n) pass. Split out of `useAdminJobs` so list shaping never
 * re-runs the action callbacks (and vice versa).
 */
export function useAdminDerived(jobs: JobEntry[], deferredFilter: string) {
  const sortedJobs = useMemo(() => {
    if (jobs.length <= 1) return jobs;
    try {
      return (jobs as JobEntry[]).toSorted((a, b) => b.createdAt - a.createdAt);
    } catch {
      return [...jobs].sort((a, b) => b.createdAt - a.createdAt);
    }
  }, [jobs]);

  const filteredAndCounts = useMemo(() => {
    if (jobs.length === 0)
      return {
        filtered: [] as JobEntry[],
        pendingCount: 0,
        completedCount: 0,
        failedCount: 0,
      };
    const len = jobs.length;
    const filtered: JobEntry[] = [];
    let pendingCount = 0;
    let completedCount = 0;
    let failedCount = 0;
    const f = deferredFilter;
    const isAll = f === "all";
    for (let i = 0; i < len; i++) {
      const job = sortedJobs[i];
      const status = job.status;
      // Pending = actively transcoding + waiting in the bounded queue.
      if (status === "processing" || status === "queued") pendingCount += 1;
      else if (status === "completed") completedCount += 1;
      else if (status === "failed" || status === "cancelled") failedCount += 1;
      if (isAll || status === f) filtered.push(job);
    }
    return { filtered, pendingCount, completedCount, failedCount };
  }, [jobs, sortedJobs, deferredFilter]);

  return {
    filtered: filteredAndCounts.filtered,
    pendingCount: filteredAndCounts.pendingCount,
    completedCount: filteredAndCounts.completedCount,
    failedCount: filteredAndCounts.failedCount,
    hasJobs: jobs.length > 0,
  };
}
