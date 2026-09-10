"use client";

import { memo } from "react";
import { Button } from "@/components/ui/button";
import { AreaShell } from "@/components/shared/AreaShell";
import { LayoutGrid, RefreshCw, FolderOutput } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MobileLayout } from "@/lib/mobile-layout";

// ---------------------------------------------------------------------------
// BulkArea — CropArea-style control & readout surface for bulk export
// ---------------------------------------------------------------------------
// Mirrors pageEditorCrop CropArea: one authoritative bar (top bar + readout
// grid + hint). Readouts are derived, never stored. Zones come from the
// Mobile editor preference; Sync re-reads it, Change re-picks the output.

export type BulkAreaProps = {
  layout: MobileLayout | null;
  total: number;
  selectedCount: number;
  completedCount: number;
  failedCount: number;
  splitLabel: string;
  useWatermark: boolean;
  inputFolderName: string | null;
  outputDirName: string | null;
  activeExports: number;
  onSync: () => void;
  onOutput: () => void;
};

export const BulkArea = memo(function BulkArea({
  layout,
  total,
  selectedCount,
  completedCount,
  failedCount,
  splitLabel,
  useWatermark,
  inputFolderName,
  outputDirName,
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
      readouts={[
        {
          label: "Files",
          value: (
            <>
              <div className="mt-0.5 font-mono text-xs tabular-nums">
                {total} total · {selectedCount} selected
              </div>
              <div
                className={cn(
                  "font-mono text-[11px] tabular-nums",
                  failedCount > 0 ? "text-kumo-warn" : "text-kumo-subtle",
                )}
              >
                {completedCount} done
                {failedCount > 0 ? ` · ${failedCount} failed` : ""}
              </div>
            </>
          ),
        },
        {
          label: "Zones (pct)",
          value: layout ? (
            <div className="mt-0.5 space-y-0.5 font-mono text-[11px] tabular-nums text-kumo-subtle">
              {layout.zones.map((z) => (
                <div key={z.id}>
                  {z.id === "zone-1" ? "Z1" : "Z2"} {z.x.toFixed(1)},
                  {z.y.toFixed(1)} · {z.width.toFixed(1)}×{z.height.toFixed(1)}{" "}
                  · {z.zoom.toFixed(2)}×
                </div>
              ))}
            </div>
          ) : (
            <>
              <div className="mt-0.5 font-mono text-xs tabular-nums text-kumo-warn">
                no stacked layout
              </div>
              <div className="font-mono text-[11px] tabular-nums text-kumo-subtle">
                save one in Mobile editor
              </div>
            </>
          ),
        },
        {
          label: "Output",
          value: (
            <>
              <div className="mt-0.5 truncate font-mono text-xs tabular-nums">
                {outputDirName ?? "Downloads (fallback)"}
              </div>
              <div className="font-mono text-[11px] tabular-nums text-kumo-subtle">
                mp4 · 1080 × 1920
              </div>
            </>
          ),
        },
        {
          label: "Export",
          value: (
            <>
              <div className="mt-0.5 font-mono text-[11px] leading-4 tabular-nums text-kumo-subtle">
                mp4 · 60fps · CRF 10 · full length
              </div>
              <div className="font-mono text-[11px] tabular-nums text-kumo-subtle">
                trim ignored · {useWatermark ? "watermark" : "no watermark"}
              </div>
            </>
          ),
        },
      ]}
      hint={
        <span>
          Zones come from the Mobile editor — press Sync zones after changing
          them · renders run through the export queue
        </span>
      }
    />
  );
});
