"use client";

import { ViewTransition } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/format-time";
import type { MobileLayout } from "@/lib/mobile-layout";
import { CellPreview } from "./CellPreview";
import { STATUS_LABEL, statusColor } from "./helpers";
import type { BulkItem } from "./types";

export type BulkItemCardProps = {
  item: BulkItem;
  stackedLayout: MobileLayout | null;
  useWatermark: boolean;
  isExporting: boolean;
  expanded?: boolean;
  onExpand?: (id: string) => void;
  onPatch: (id: string, patch: Partial<BulkItem>) => void;
  onMeta: (
    id: string,
    meta: { duration: number; width: number; height: number },
  ) => void;
};

export function BulkItemCard({
  item: it,
  stackedLayout,
  useWatermark,
  isExporting,
  expanded = false,
  onExpand,
  onPatch,
  onMeta,
}: BulkItemCardProps) {
  const preview = stackedLayout ? (
    <CellPreview
      url={it.url}
      layout={stackedLayout}
      useWatermark={useWatermark}
      onMeta={(m) => onMeta(it.id, m)}
    />
  ) : null;

  return (
    <Card
      className={cn(
        "overflow-hidden transition-colors",
        expanded && "border-kumo-brand/40",
      )}
    >
      <CardContent className="space-y-2 p-3">
        <div className="flex items-start gap-2">
          <Checkbox
            checked={it.selected}
            onCheckedChange={(v) =>
              onPatch(it.id, { selected: v === true })
            }
            disabled={isExporting}
            aria-label={`Include ${it.name} in bulk export`}
            className="mt-0.5"
          />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span
              className="truncate font-mono text-[11px] font-medium tabular-nums"
              title={it.name}
            >
              {it.baseName}
            </span>
            <span className="font-mono text-[11px] tabular-nums text-kumo-subtle">
              {it.duration > 0 ? formatTime(it.duration) : "…"}
              {it.width > 0 ? ` · ${it.width}×${it.height}` : ""}
            </span>
          </div>
        </div>
        {preview ? (
          expanded ? (
            // Expanded item keeps its preview un-named so the
            // `bulk-cell-<id>` name lives only on BulkExpandedView
            // during the morph (duplicate names break the transition).
            <div className="flex flex-col items-center opacity-60">{preview}</div>
          ) : (
            <ViewTransition
              name={`bulk-cell-${it.id}`}
              share="morph"
              default="none"
            >
              <button
                type="button"
                onClick={() => onExpand?.(it.id)}
                aria-expanded={false}
                aria-label={`Expand ${it.baseName} preview`}
                title="Expand preview with playback controls"
                className="flex w-full cursor-zoom-in flex-col items-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kumo-focus"
              >
                {preview}
              </button>
            </ViewTransition>
          )
        ) : null}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-[11px] leading-none tabular-nums text-kumo-subtle">
            <span
              className={cn(
                "size-1.5 rounded-full",
                statusColor(it.status),
              )}
              aria-hidden
            />
            {STATUS_LABEL[it.status]}
            {it.status === "uploading" || it.status === "processing" ? (
              <span className="ml-auto">{it.progress}%</span>
            ) : null}
          </div>
          {it.status === "uploading" ||
          it.status === "processing" ||
          it.status === "saving" ? (
            <Progress value={it.progress} />
          ) : null}
          {it.error ? (
            <p className="text-[11px] leading-4 text-kumo-warn break-words">
              {it.error}
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
