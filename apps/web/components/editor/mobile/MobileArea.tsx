import { Button } from "@/components/ui/button";
import { Redo2, Save, SlidersHorizontal, Smartphone, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { OUTPUT_H, OUTPUT_W } from "@/lib/mobile-layout";
import type { MobileAreaProps } from "./types";

export function MobileArea({
  layout,
  selected,
  modeBadge,
  splitLabel,
  sourceLabel,
  outputLabel,
  trimLabel,
  timeLabel,
  filterPreview,
  validationError,
  isStale,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onSave,
}: MobileAreaProps) {
  const status = validationError ? "invalid" : isStale ? "syncing" : "ready";
  const zoneLabel =
    layout.zones.length > 0
      ? `${layout.zones.length} zone${layout.zones.length === 1 ? "" : "s"}`
      : "no zones";

  return (
    <div className="col-span-full rounded-md border border-kumo-hairline bg-kumo-recessed">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="inline-flex size-7 items-center justify-center rounded-md border border-kumo-line bg-kumo-base text-kumo-subtle">
            <Smartphone className="size-3.5" aria-hidden />
          </span>
          <div className="flex flex-col gap-0.5">
            <span className="flex items-center gap-2 text-xs font-semibold leading-none">
              Mobile area
              <span
                className={cn(
                  "inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none tabular-nums",
                  validationError
                    ? "border-kumo-warn/30 bg-kumo-warn/10 text-kumo-warn"
                    : "border-kumo-hairline bg-kumo-base text-kumo-subtle",
                )}
              >
                {modeBadge}
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] font-normal">
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    validationError
                      ? "bg-kumo-warn"
                      : isStale
                        ? "bg-kumo-warn animate-pulse"
                        : "bg-kumo-success",
                  )}
                  aria-hidden
                />
                <span
                  className={
                    validationError ? "text-kumo-warn" : "text-kumo-subtle"
                  }
                >
                  {status}
                </span>
              </span>
            </span>
            <span className="text-[11px] leading-none text-kumo-subtle tabular-nums">
              {zoneLabel}
              <span aria-hidden className="mx-1 text-kumo-hairline">
                ·
              </span>
              {outputLabel}
              <span aria-hidden className="mx-1 text-kumo-hairline">
                ·
              </span>
              source {sourceLabel}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            onClick={onUndo}
            disabled={!canUndo}
            className="h-7 rounded-md text-xs"
            title="Undo layout change"
            aria-label="Undo layout change"
          >
            <Undo2 className="size-3.5" aria-hidden />
            Undo
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onRedo}
            disabled={!canRedo}
            className="h-7 rounded-md text-xs"
            title="Redo layout change"
            aria-label="Redo layout change"
          >
            <Redo2 className="size-3.5" aria-hidden />
            Redo
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={onSave}
            className="h-7 gap-1.5 rounded-md text-xs"
            title="Save layout to localStorage"
            aria-label="Save layout preference"
          >
            <Save className="size-3.5" aria-hidden />
            Save
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px border-t border-kumo-hairline bg-kumo-hairline sm:grid-cols-4">
        <div className="bg-kumo-recessed px-3 py-2">
          <div className="text-[10px] font-medium uppercase tracking-wide text-kumo-subtle">
            Zones (pct)
          </div>
          <div className="mt-0.5 space-y-0.5 font-mono text-[11px] tabular-nums">
            {layout.zones.map((z) => {
              const isSel = z.id === selected;
              const tag = z.id === "zone-1" ? "Z1" : "Z2";
              return (
                <div
                  key={z.id}
                  className={isSel ? "text-kumo-brand" : "text-kumo-subtle"}
                >
                  {tag} {z.x.toFixed(1)},{z.y.toFixed(1)} · {z.width.toFixed(1)}
                  ×{z.height.toFixed(1)} · {z.zoom.toFixed(2)}×
                  {z.role ? ` · ${z.role}` : ""}
                  {z.locked ? " · locked" : ""}
                </div>
              );
            })}
          </div>
        </div>
        <div className="bg-kumo-recessed px-3 py-2">
          <div className="text-[10px] font-medium uppercase tracking-wide text-kumo-subtle">
            Split / Trim
          </div>
          <div className="mt-0.5 font-mono text-xs tabular-nums">
            {splitLabel}%
          </div>
          <div className="font-mono text-[11px] tabular-nums text-kumo-subtle">
            {trimLabel}
          </div>
          <div className="font-mono text-[11px] tabular-nums text-kumo-subtle">
            {timeLabel}
          </div>
        </div>
        <div className="bg-kumo-recessed px-3 py-2">
          <div className="text-[10px] font-medium uppercase tracking-wide text-kumo-subtle">
            FFmpeg
          </div>
          <div className="mt-0.5 line-clamp-3 font-mono text-[11px] leading-4 tabular-nums text-kumo-subtle break-all">
            {filterPreview || "—"}
          </div>
        </div>
        <div className="bg-kumo-recessed px-3 py-2">
          <div className="text-[10px] font-medium uppercase tracking-wide text-kumo-subtle">
            Status
          </div>
          <div className="mt-0.5 font-mono text-xs tabular-nums">
            {validationError ? "invalid" : status}
          </div>
          <div className="font-mono text-[11px] tabular-nums text-kumo-subtle">
            {validationError ?? `${OUTPUT_W}×${OUTPUT_H} · 9:16`}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 border-t border-kumo-hairline px-3 py-2 text-[11px] leading-none text-kumo-subtle">
        <SlidersHorizontal className="size-3 shrink-0" aria-hidden />
        {layout.mode === "full" ? (
          <span>
            Full mode renders Zone 1 only · switch to Stacked for two zones
          </span>
        ) : (
          <span>
            Drag zones on the source stage · drag the preview divider to split ·
            zoom per zone card
          </span>
        )}
      </div>
    </div>
  );
}
