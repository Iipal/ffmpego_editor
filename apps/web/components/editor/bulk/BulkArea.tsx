"use client";

import { memo } from "react";
import { Button } from "@/components/ui/button";
import { AreaShell } from "@/components/shared/AreaShell";
import { LayoutGrid, RefreshCw, FolderOutput } from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// BulkArea — slim stage toolbar for bulk export (readout grid removed:
// files/zones/output/export all live in the header, item cards, and the
// Bulk settings rail). Zones come from the Mobile editor preference; Sync
// re-reads it, Change re-picks the output.
// ---------------------------------------------------------------------------

export type BulkAreaProps = {
  total: number;
  selectedCount: number;
  splitLabel: string;
  useWatermark: boolean;
  inputFolderName: string | null;
  activeExports: number;
  onSync: () => void;
  onOutput: () => void;
};

export const BulkArea = memo(function BulkArea({
  total,
  selectedCount,
  splitLabel,
  useWatermark,
  inputFolderName,
  activeExports,
  onSync,
  onOutput,
}: BulkAreaProps) {
  return (
    <AreaShell
      icon={<LayoutGrid className="size-3.5" aria-hidden />}
      title="Bulk area"
      badges={
        <>
          <span className="inline-flex items-center rounded-full border border-kumo-hairline bg-kumo-base px-1.5 py-0.5 text-[10px] font-medium leading-none tabular-nums text-kumo-subtle">
            Stacked {splitLabel}
          </span>
          <span
            className={cn(
              "inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none",
              useWatermark
                ? "border-kumo-brand/20 bg-kumo-brand/10 text-kumo-brand"
                : "border-kumo-hairline bg-kumo-base text-kumo-subtle",
            )}
          >
            {useWatermark ? "watermark on" : "watermark off"}
          </span>
          {activeExports > 0 ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-normal text-kumo-brand">
              <span
                className="size-1.5 rounded-full bg-kumo-brand animate-pulse"
                aria-hidden
              />
              {activeExports} exporting
            </span>
          ) : null}
        </>
      }
      subtitle={
        <>
          {inputFolderName ?? "Input folder"}
          <span aria-hidden className="mx-1 text-kumo-hairline">
            ·
          </span>
          {total} video{total === 1 ? "" : "s"} · {selectedCount} selected
          <span aria-hidden className="mx-1 text-kumo-hairline">
            ·
          </span>
          1080 × 1920
        </>
      }
      actions={
        <>
          <Button
            size="sm"
            variant="secondary"
            onClick={onSync}
            className="h-7 gap-1.5 rounded-md text-xs"
            title="Re-read zones from the Mobile editor"
            aria-label="Sync zones from Mobile editor"
          >
            <RefreshCw className="size-3.5" aria-hidden />
            Sync zones
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onOutput}
            className="h-7 gap-1.5 rounded-md text-xs"
            title="Pick output folder"
            aria-label="Pick output folder"
          >
            <FolderOutput className="size-3.5" aria-hidden />
            Output
          </Button>
        </>
      }
    />
  );
});
