"use client";

import { memo } from "react";
import { HardDrive } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { videoFileService } from "@/lib/video-file";
import type { StorageStats } from "@/lib/storage";

export type StorageAreaProps = {
  /** Store census from `GET /api/storage/stats` (managed bytes vs quota). */
  storage?: StorageStats | undefined;
  storageLoading?: boolean;
  storageError?: string | null;
  /** `POST /api/storage/sweep` in flight (reaps expired/stale/orphan rows). */
  sweepPending?: boolean;
  onSweep: () => void;
};

// Warn when the managed store approaches quota — past this point new exports
// fail with 507 QUOTA_EXCEEDED/DISK_FULL, so the dashboard must say so before
// the user queues more work.
const STORAGE_WARN_PCT = 90;

// StorageArea — quota census + on-demand sweep. Extracted from JobsArea so
// the admin top row is three peer cards (JobsArea / StorageArea /
// UploadSessions). Warns at ≥90% since new exports then fail with 507.
export const StorageArea = memo(function StorageArea({
  storage,
  storageLoading,
  storageError,
  sweepPending,
  onSweep,
}: StorageAreaProps) {
  const quotaBytes = storage?.quotaBytes ?? 0;
  const usedBytes = storage?.bytes ?? 0;
  const usedPct =
    storage && quotaBytes > 0
      ? Math.min(100, (usedBytes / quotaBytes) * 100)
      : 0;
  const storageFull = usedPct >= STORAGE_WARN_PCT;
  const assetCount = storage?.byRole.asset ?? 0;
  const artifactCount = storage?.byRole.artifact ?? 0;
  return (
    <div className="rounded-md border border-kumo-hairline bg-kumo-recessed">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="inline-flex size-7 items-center justify-center rounded-md border border-kumo-line bg-kumo-base text-kumo-subtle">
            <HardDrive className="size-3.5" aria-hidden />
          </span>
          <div className="flex flex-col gap-0.5">
            <span className="flex items-center gap-2 text-xs font-semibold leading-none">
              Storage
              <span className="inline-flex items-center rounded-full border border-kumo-hairline bg-kumo-base px-1.5 py-0.5 text-[10px] font-medium leading-none tabular-nums text-kumo-subtle">
                {storage ? `${storage.files} files` : "—"}
              </span>
            </span>
            <span className="text-[11px] leading-none text-kumo-subtle">
              Managed bytes vs quota · live jobs never swept
            </span>
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={onSweep}
          disabled={sweepPending || storageLoading}
          className="h-7 rounded-md text-xs"
          title="Reap expired, stale and orphan store records (live jobs are never touched)"
          aria-label="Sweep expired store files"
        >
          {sweepPending ? "Sweeping…" : "Sweep"}
        </Button>
      </div>

      <div className="border-t border-kumo-hairline px-3 py-2">
        {storage ? (
          <div>
            <Progress
              value={usedPct}
              aria-label={`Storage ${usedPct.toFixed(0)} percent used`}
            />
            <div className="mt-1 flex flex-wrap items-baseline gap-x-2 text-[11px] leading-none tabular-nums">
              <span
                className={cn(
                  "font-mono font-medium",
                  storageFull ? "text-kumo-warn" : "text-kumo-subtle",
                )}
              >
                {videoFileService.formatFileSize(usedBytes)} of{" "}
                {videoFileService.formatFileSize(quotaBytes)} (
                {usedPct.toFixed(0)}%)
              </span>
              <span aria-hidden className="text-kumo-hairline">
                ·
              </span>
              <span className="font-mono text-kumo-subtle">
                {assetCount} asset{assetCount === 1 ? "" : "s"}
              </span>
              <span aria-hidden className="text-kumo-hairline">
                ·
              </span>
              <span className="font-mono text-kumo-subtle">
                {artifactCount} artifact{artifactCount === 1 ? "" : "s"}
              </span>
            </div>
            {storageFull && (
              <p
                className="mt-1 text-[11px] leading-snug text-kumo-warn"
                role="alert"
              >
                Quota nearly full — new exports fail with 507
                QUOTA_EXCEEDED/DISK_FULL. Sweep or delete jobs to free space.
              </p>
            )}
          </div>
        ) : storageError ? (
          <p className="text-[11px] leading-snug text-red-500">
            Storage stats unavailable: {storageError}
          </p>
        ) : (
          <p className="text-[11px] leading-none text-kumo-subtle">
            {storageLoading === false
              ? "No storage data."
              : "Checking storage…"}
          </p>
        )}
      </div>
    </div>
  );
});
