"use client";

import { memo } from "react";
import { CloudUpload, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { videoFileService } from "@/lib/video-file";
import type { UploadSession } from "@/lib/upload-sessions";

export type UploadSessionsProps = {
  /** Open sessions from `GET /api/upload/sessions`, newest first. */
  sessions: UploadSession[];
  sessionsLoading: boolean;
  sessionsError: string | null;
  /** Upload ID of the in-flight abort (row button spinner state). */
  abortPendingId: string | null;
  onAbort: (uploadId: string) => void;
};

// Idle this long with no complete → almost certainly abandoned (the server
// sweeps at 6h; flag early so orphans get aborted instead of lingering).
const STALE_AGE_SECONDS = 3600;

function formatAge(ageSeconds: number): string {
  if (ageSeconds < 60) return `${ageSeconds}s ago`;
  const minutes = Math.floor(ageSeconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// UploadSessions — ops surface for interrupted chunked uploads. Each row is
// a session still holding server bytes: the progress bar is its resume
// progress (a re-upload of the same file transparently continues from
// `received` via the status skip-set), and Abort releases the bytes now via
// `DELETE /upload/:uploadId` instead of waiting for the 6h server sweep.
// Refcount-aware server-side: aborting never deletes bytes a live job holds.
export const UploadSessions = memo(function UploadSessions({
  sessions,
  sessionsLoading,
  sessionsError,
  abortPendingId,
  onAbort,
}: UploadSessionsProps) {
  return (
    <div className="rounded-md border border-kumo-hairline bg-kumo-recessed">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="inline-flex size-7 items-center justify-center rounded-md border border-kumo-line bg-kumo-base text-kumo-subtle">
            <CloudUpload className="size-3.5" aria-hidden />
          </span>
          <div className="flex flex-col gap-0.5">
            <span className="flex items-center gap-2 text-xs font-semibold leading-none">
              Upload sessions
              <span className="inline-flex items-center rounded-full border border-kumo-hairline bg-kumo-base px-1.5 py-0.5 text-[10px] font-medium leading-none tabular-nums text-kumo-subtle">
                {sessions.length} open
              </span>
            </span>
            <span className="text-[11px] leading-none text-kumo-subtle">
              Interrupted uploads keep server bytes until completed, aborted, or
              swept after 6h
            </span>
          </div>
        </div>
      </div>

      <div className="border-t border-kumo-hairline">
        {sessionsLoading && sessions.length === 0 ? (
          <p className="px-3 py-2 text-[11px] leading-none text-kumo-subtle">
            Checking sessions…
          </p>
        ) : sessionsError ? (
          <p className="px-3 py-2 text-[11px] leading-snug text-red-500">
            Sessions unavailable: {sessionsError}
          </p>
        ) : sessions.length === 0 ? (
          <p className="px-3 py-2 text-[11px] leading-none text-kumo-subtle">
            No open upload sessions.
          </p>
        ) : (
          <ul className="divide-y divide-kumo-hairline">
            {sessions.map((s) => {
              const stale = s.ageSeconds >= STALE_AGE_SECONDS;
              const aborting = abortPendingId === s.uploadId;
              return (
                <li
                  key={s.uploadId}
                  className="flex items-center gap-3 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="truncate text-xs font-medium">
                        {s.filename}
                      </span>
                      {stale && (
                        <span className="inline-flex items-center rounded-full border border-kumo-hairline bg-kumo-base px-1.5 py-0.5 text-[10px] font-medium leading-none text-kumo-warn">
                          stale
                        </span>
                      )}
                    </div>
                    <Progress
                      value={s.percent}
                      aria-label={`Upload ${s.filename} ${s.percent} percent received`}
                      className="mt-1.5"
                    />
                    <div className="mt-1 flex flex-wrap items-baseline gap-x-2 text-[11px] leading-none tabular-nums">
                      <span className="font-mono text-kumo-subtle">
                        {videoFileService.formatFileSize(s.received)} of{" "}
                        {videoFileService.formatFileSize(s.totalSize)} (
                        {s.percent}%)
                      </span>
                      <span aria-hidden className="text-kumo-hairline">
                        ·
                      </span>
                      <span className="font-mono text-kumo-subtle">
                        started {formatAge(s.ageSeconds)}
                      </span>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onAbort(s.uploadId)}
                    disabled={aborting}
                    className={cn(
                      "h-7 shrink-0 rounded-md text-xs",
                      !aborting && "text-red-500 hover:text-red-500",
                    )}
                    title="Abort this session now and release its bytes (live job inputs are never deleted)"
                    aria-label={`Abort upload session ${s.filename}`}
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                    {aborting ? "Aborting…" : "Abort"}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="border-t border-kumo-hairline px-3 py-2 text-[11px] leading-snug text-kumo-subtle">
        Re-uploading the same file resumes from the received bytes automatically
        — only missing chunks are re-sent.
      </div>
    </div>
  );
});
