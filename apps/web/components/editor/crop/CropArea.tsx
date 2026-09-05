"use client";

import { Crop, Save, SlidersHorizontal } from "lucide-react";
import { SidebarToggle } from "@/components/editor/Sidebar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatPct } from "./helpers";
import { useCropControls } from "./hooks";

// Design goals (replaces all previous crop boilerplate):
//  - Single source of truth: `store.crop` is the only mutable state.
//  - Percentages are always 0..100 relative to source pixels (store invariant).
//  - Pixel readout is derived, never stored.
//  - No useDeferredValue / useTransition / stale flags — crop is synchronous.
//  - No manual Map caches, no duplicated localStorage logic, no avg stats.
//  - Visual: one authoritative bar that tells the user what will be exported.
//  - Actions: enable/disable crop mode, reset to full frame, aspect badge.
//  - The interactive rectangle itself lives in CropOverlay (pointer handling);
//    this component is the *control & readout* surface for the crop area.

export function CropArea() {
  const {
    crop,
    aspectRatio,
    isCropMode,
    hasSource,
    px,
    cropLabel,
    sourceLabel,
    isFullFrame,
    resetCrop,
    toggleCropMode,
    saveCrop,
  } = useCropControls();

  return (
    <div className="rounded-md border border-kumo-hairline bg-kumo-recessed">
      {/* Top bar: identity + actions */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="inline-flex size-7 items-center justify-center rounded-md border border-kumo-line bg-kumo-base text-kumo-subtle">
            <Crop className="size-3.5" aria-hidden />
          </span>
          <div className="flex flex-col gap-0.5">
            <span className="flex items-center gap-2 text-xs font-semibold leading-none">
              Crop area
              <span
                className={cn(
                  "inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none tabular-nums",
                  isFullFrame
                    ? "border-kumo-hairline bg-kumo-base text-kumo-subtle"
                    : "border-kumo-brand/20 bg-kumo-brand/10 text-kumo-brand",
                )}
              >
                {aspectRatio}
              </span>
              {isCropMode ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-normal text-kumo-success">
                  <span
                    className="size-1.5 rounded-full bg-kumo-success"
                    aria-hidden
                  />
                  editing
                </span>
              ) : null}
            </span>
            <span className="text-[11px] leading-none text-kumo-subtle tabular-nums">
              {cropLabel}
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
            variant={isCropMode ? "default" : "outline"}
            onClick={toggleCropMode}
            className="h-7 rounded-md text-xs"
          >
            {isCropMode ? "Done" : "Edit crop"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={resetCrop}
            className="h-7 rounded-md text-xs"
            title="Restore saved crop from localStorage"
          >
            Reset
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={saveCrop}
            className="h-7 gap-1.5 rounded-md text-xs"
            title="Save crop to localStorage"
            aria-label="Save crop settings"
          >
            <Save className="size-3.5" aria-hidden />
            Save
          </Button>

          <SidebarToggle />
        </div>
      </div>

      {/* Readout grid: pct + px, single source of truth */}
      <div className="grid grid-cols-2 gap-px border-t border-kumo-hairline bg-kumo-hairline sm:grid-cols-4">
        <div className="bg-kumo-recessed px-3 py-2">
          <div className="text-[10px] font-medium uppercase tracking-wide text-kumo-subtle">
            X / Y (pct)
          </div>
          <div className="mt-0.5 font-mono text-xs tabular-nums">
            {formatPct(crop.x)} · {formatPct(crop.y)}
          </div>
          {px && (
            <div className="font-mono text-[11px] tabular-nums text-kumo-subtle">
              {px.x} · {px.y} px
            </div>
          )}
        </div>
        <div className="bg-kumo-recessed px-3 py-2">
          <div className="text-[10px] font-medium uppercase tracking-wide text-kumo-subtle">
            Size (pct)
          </div>
          <div className="mt-0.5 font-mono text-xs tabular-nums">
            {formatPct(crop.width)} × {formatPct(crop.height)}
          </div>
          {px && (
            <div className="font-mono text-[11px] tabular-nums text-kumo-subtle">
              {px.w} × {px.h} px
            </div>
          )}
        </div>
        <div className="bg-kumo-recessed px-3 py-2">
          <div className="text-[10px] font-medium uppercase tracking-wide text-kumo-subtle">
            End (pct)
          </div>
          <div className="mt-0.5 font-mono text-xs tabular-nums">
            {formatPct(crop.x + crop.width)} · {formatPct(crop.y + crop.height)}
          </div>
          {px && (
            <div className="font-mono text-[11px] tabular-nums text-kumo-subtle">
              {px.x2} · {px.y2} px
            </div>
          )}
        </div>
        <div className="bg-kumo-recessed px-3 py-2">
          <div className="text-[10px] font-medium uppercase tracking-wide text-kumo-subtle">
            FFmpeg
          </div>
          <div className="mt-0.5 font-mono text-[11px] leading-4 tabular-nums text-kumo-subtle">
            {hasSource && px
              ? `crop=${px.w}:${px.h}:${px.x}:${px.y}`
              : `crop=${crop.width.toFixed(1)}%:${crop.height.toFixed(1)}%:${crop.x.toFixed(1)}%:${crop.y.toFixed(1)}%`}
          </div>
        </div>
      </div>

      {/* Hint — operational, not decorative */}
      <div className="flex items-center gap-1.5 border-t border-kumo-hairline px-3 py-2 text-[11px] leading-none text-kumo-subtle">
        <SlidersHorizontal className="size-3 shrink-0" aria-hidden />
        {isCropMode ? (
          <span>
            Drag the rectangle to move · drag handles to resize · aspect lock in
            sidebar
          </span>
        ) : (
          <span>Click “Edit crop” to adjust the rectangle on the video</span>
        )}
      </div>
    </div>
  );
}
