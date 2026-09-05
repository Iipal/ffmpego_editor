"use client";

import { Button } from "@/components/ui/button";

export type BulkHeaderProps = {
  inputFolderName: string | null;
  total: number;
  selectedCount: number;
  completedCount: number;
  failedCount: number;
  splitLabel: string;
  isExporting: boolean;
  onSelectAll: () => void;
  onSelectNone: () => void;
  onBulkExport: () => void;
};

export function BulkHeader({
  inputFolderName,
  total,
  selectedCount,
  completedCount,
  failedCount,
  splitLabel,
  isExporting,
  onSelectAll,
  onSelectNone,
  onBulkExport,
}: BulkHeaderProps) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-kumo-hairline pb-4">
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold leading-none tracking-normal">
            Mobile bulk export
          </h2>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-kumo-hairline bg-kumo-recessed px-2 py-0.5 text-[11px] font-medium leading-none text-kumo-subtle">
            <span
              className="size-1.5 rounded-full bg-kumo-brand"
              aria-hidden
            />
            Stacked {splitLabel}
            <span aria-hidden className="opacity-40">
              ·
            </span>
            <span className="tabular-nums">
              {completedCount}/{total} done
            </span>
          </span>
        </div>
        <p className="flex flex-wrap items-center gap-1.5 text-xs leading-4 text-kumo-subtle">
          <span>
            {inputFolderName ?? "Input folder"} · {total} video
            {total === 1 ? "" : "s"} · {selectedCount} selected
          </span>
          <span aria-hidden className="text-kumo-hairline">
            ·
          </span>
          <span className="tabular-nums">Full length · 1080 × 1920</span>
          {failedCount > 0 ? (
            <>
              <span aria-hidden className="text-kumo-hairline">
                ·
              </span>
              <span className="text-kumo-warn">{failedCount} failed</span>
            </>
          ) : null}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 justify-end">
        <Button
          size="sm"
          variant="secondary"
          onClick={onSelectAll}
          className="h-7 rounded-md text-xs"
        >
          Select all
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={onSelectNone}
          className="h-7 rounded-md text-xs"
        >
          Select none
        </Button>
        <span aria-hidden className="h-5 w-px bg-kumo-hairline mx-0.5" />
        <Button
          size="sm"
          onClick={onBulkExport}
          disabled={isExporting || selectedCount === 0}
          className="h-7 rounded-md text-xs font-medium"
        >
          {isExporting ? "Exporting…" : `Bulk Export (${selectedCount})`}
        </Button>
      </div>
    </header>
  );
}
