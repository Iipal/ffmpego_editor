"use client";

import { memo, useCallback, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import type { JobRowProps } from "./types";
import { JOB_ID_RE, formatAge, statusBadge } from "./helpers";
import { preloadHeavyProgress } from "./heavy";

// JobRow — rerender-memo, rerender-no-inline-components, rendering-content-visibility
// js-batch-dom-css via single className toggle (no per-prop style thrash)
export const JobRow = memo(function JobRow({
  job,
  entry,
  onDelete,
  onCancel,
  onDownload,
  onCompare,
  onRetry,
  onRename,
  deletePending,
  cancelPending,
  renamePending,
}: JobRowProps) {
  // rerender-simple-expression-in-memo: simple expression inside memo, no useMemo needed
  // B2: queued jobs wait for a worker slot; flag only exaggerated waits.
  const isHanged =
    (job.status === "processing" &&
      (job.ageSeconds > 30 || (job.progress === 0 && job.ageSeconds > 10))) ||
    (job.status === "queued" && job.ageSeconds > 120);
  const isActive = job.status === "processing" || job.status === "queued";
  const isCompleted = job.status === "completed";
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

  const handleCancel = useCallback(() => {
    if (!JOB_ID_RE.test(job.jobId)) {
      toast.error("Invalid job id");
      return;
    }
    // B2: cooperative cancel — kills ffmpeg, keeps row + logTail + files.
    if (!confirm(`Cancel job ${shortId} (${status})? Files are kept.`)) return;
    onCancel(job.jobId);
  }, [job.jobId, shortId, status, onCancel]);

  const handleDownload = useCallback(() => {
    onDownload(job);
  }, [job, onDownload]);

  const handleCompare = useCallback(() => {
    onCompare?.(job);
  }, [job, onCompare]);

  const handleRetry = useCallback(() => {
    if (entry) onRetry?.(entry);
  }, [entry, onRetry]);

  // Inline rename (server PATCH + local history label).
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState("");
  const startRename = useCallback(() => {
    setDraftName(job.filename || job.outputFile?.name || "");
    setRenaming(true);
  }, [job.filename, job.outputFile]);
  const submitRename = useCallback(() => {
    if (!onRename) return;
    void onRename(job.jobId, draftName)
      .then(() => {
        setRenaming(false);
        toast.success("Renamed");
      })
      .catch((e: unknown) =>
        toast.error(e instanceof Error ? e.message : "Rename failed"),
      );
  }, [onRename, job.jobId, draftName]);

  const canRetry =
    !!entry &&
    (entry.kind === "audio-extract" || !!entry.settingsJson) &&
    !isActive;

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
              title={job.outputFile?.name ?? job.jobId}
            >
              {job.outputFile?.name ?? "output pending…"}
            </span>
            {job.alternateFile ? (
              <span className="font-mono break-all text-kumo-subtle">
                + {job.alternateFile.name}
              </span>
            ) : null}
          </div>
          {renaming ? (
            <form
              className="mt-1.5 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                submitRename();
              }}
            >
              <Input
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                className="h-7 text-xs"
                autoFocus
                aria-label="Job name"
              />
              <Button type="submit" size="xs" disabled={renamePending}>
                Save
              </Button>
              <Button
                type="button"
                size="xs"
                variant="ghost"
                onClick={() => setRenaming(false)}
              >
                Cancel
              </Button>
            </form>
          ) : null}
          {job.error ? (
            <p className="mt-1 text-xs text-red-600 wrap-break-word">
              {typeof job.exitCode === "number"
                ? `(exit ${job.exitCode}) `
                : null}
              {job.error}
            </p>
          ) : null}
          {job.status === "queued" && typeof job.queuePosition === "number" ? (
            <p className="mt-1 text-xs text-kumo-subtle">
              Queue position #{job.queuePosition + 1} — waiting for a worker…
            </p>
          ) : null}
          {job.logTail ? (
            <details className="mt-1 text-xs">
              <summary className="cursor-pointer text-kumo-subtle hover:text-kumo-strong">
                ffmpeg log tail
              </summary>
              <pre className="mt-1 max-h-40 overflow-auto rounded border border-kumo-line bg-kumo-recessed p-2 font-mono text-[11px] whitespace-pre-wrap wrap-break-word">
                {job.logTail}
              </pre>
            </details>
          ) : null}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {isCompleted ? (
            <>
              <Button
                variant="outline"
                size="xs"
                onClick={handleDownload}
                title="Re-download output (kept server-side until deleted)"
              >
                Download
              </Button>
              {onCompare ? (
                <Button
                  variant="outline"
                  size="xs"
                  onClick={handleCompare}
                  title="Side-by-side source/output comparison"
                >
                  Compare
                </Button>
              ) : null}
            </>
          ) : null}
          {canRetry && onRetry ? (
            <Button
              variant="outline"
              size="xs"
              onClick={handleRetry}
              title="Re-queue with the stored settings"
            >
              Retry
            </Button>
          ) : null}
          {isActive ? (
            <Button
              variant="outline"
              size="xs"
              onClick={handleCancel}
              disabled={cancelPending}
              title="Cancel transcode but keep the job row + logs"
            >
              Cancel
            </Button>
          ) : null}
          {onRename && !renaming ? (
            <Button
              variant="ghost"
              size="xs"
              onClick={startRename}
              title="Rename job"
            >
              Rename
            </Button>
          ) : null}
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
      {status === "processing" || status === "queued" ? (
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
