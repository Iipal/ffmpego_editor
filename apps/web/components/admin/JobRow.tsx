"use client";

import { memo, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { JobRowProps } from "./types";
import { JOB_ID_RE, formatAge, statusBadge } from "./helpers";
import { preloadHeavyProgress } from "./heavy";

// JobRow — rerender-memo, rerender-no-inline-components, rendering-content-visibility
// js-batch-dom-css via single className toggle (no per-prop style thrash)
export const JobRow = memo(function JobRow({
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
