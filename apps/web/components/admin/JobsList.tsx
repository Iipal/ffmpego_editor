"use client";

import { memo } from "react";
import { Activity, ViewTransition } from "react";
import type { JobEntry } from "./types";
import { JobRow } from "./JobRow";
import { LoadingPlaceholder, NoJobsForAll } from "./placeholders";

type JobsListProps = {
  isLoading: boolean;
  filtered: JobEntry[];
  filter: string;
  deferredFilter: string;
  isFilterStale: boolean;
  hasJobs: boolean;
  deletePending: boolean;
  onDelete: (id: string) => void;
};

export const JobsList = memo(function JobsList({
  isLoading,
  filtered,
  filter,
  deferredFilter,
  isFilterStale,
  hasJobs,
  deletePending,
  onDelete,
}: JobsListProps) {
  // rendering-conditional-render: explicit ternary (not &&) for each branch
  // rendering-content-visibility: applied per JobRow li via style prop
  // rendering-activity: preserve list DOM/state when hidden via Activity
  // rendering-hoist-jsx: LoadingPlaceholder reused
  if (isLoading) return LoadingPlaceholder;
  if (filtered.length === 0) {
    return filter !== "all" ? (
      <div className="rounded-lg border border-dashed border-kumo-line bg-kumo-recessed p-8 text-center">
        <p className="text-sm font-medium text-kumo-strong">No jobs</p>
        <p className="text-xs text-kumo-subtle mt-1">{`No jobs with status "${deferredFilter}".`}</p>
      </div>
    ) : (
      NoJobsForAll
    );
  }
  return (
    <>
      <Activity mode="visible">
        <ul
          className="space-y-3"
          style={isFilterStale ? { opacity: 0.7 } : undefined}
        >
          {filtered.map((job) => (
            <ViewTransition key={job.jobId}>
              <JobRow
                job={job}
                onDelete={onDelete}
                deletePending={deletePending}
              />
            </ViewTransition>
          ))}
        </ul>
      </Activity>
      {/* demonstrate Activity hidden branch (preserves DOM when toggled) */}
      {hasJobs ? null : (
        <Activity mode="hidden">
          <div />
        </Activity>
      )}
    </>
  );
});
